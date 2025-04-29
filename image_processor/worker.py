# image_processor/worker.py
import pika
import json
import base64
import numpy as np
import cv2
import traceback
import os
import time
import threading
import logging
from algorithms.extractor import BallotExtractor
from algorithms.processing import check_if_ballot

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('BallotWorker')

# Configuración de RabbitMQ
RABBITMQ_HOST = os.environ.get('RABBITMQ_HOST', 'localhost')
RABBITMQ_PORT = int(os.environ.get('RABBITMQ_PORT', 5672))
RABBITMQ_USER = os.environ.get('RABBITMQ_USER', 'user')
RABBITMQ_PASS = os.environ.get('RABBITMQ_PASS', 'password')
BALLOT_PROCESSING_EXCHANGE = os.environ.get('BALLOT_PROCESSING_EXCHANGE', 'ballot_processing_exchange')

# Colas
IMAGE_PROCESSING_QUEUE = os.environ.get('IMAGE_PROCESSING_QUEUE', 'image_processing_queue')
OCR_PROCESSING_QUEUE = os.environ.get('OCR_PROCESSING_QUEUE', 'ocr_processing_queue')
ANTHROPIC_FALLBACK_QUEUE = os.environ.get('ANTHROPIC_FALLBACK_QUEUE', 'anthropic_fallback_queue')
RESULTS_QUEUE = os.environ.get('RESULTS_QUEUE', 'results_queue')

# Inicializar extractor
ballot_extractor = BallotExtractor()

# Variables globales para RabbitMQ
connection = None
channel = None

def connect_to_rabbitmq():
    """Establece conexión con RabbitMQ"""
    global connection, channel
    
    try:
        # Crear conexión
        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
        parameters = pika.ConnectionParameters(
            host=RABBITMQ_HOST,
            port=RABBITMQ_PORT,
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300
        )
        
        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        
        # Declarar exchange
        channel.exchange_declare(
            exchange=BALLOT_PROCESSING_EXCHANGE,
            exchange_type='direct',
            durable=True
        )
        
        # Declarar DLX
        channel.exchange_declare(exchange='dlx', exchange_type='direct', durable=True)

        # Declarar colas
        for queue_name in [IMAGE_PROCESSING_QUEUE, OCR_PROCESSING_QUEUE, ANTHROPIC_FALLBACK_QUEUE, RESULTS_QUEUE]:
            channel.queue_declare(queue=queue_name, durable=True,
                arguments={
                    'x-dead-letter-exchange': 'dlx',
                    'x-dead-letter-routing-key': f"{queue_name}.dlq"
                }
            )
            
            # Declarar DLQ correspondiente
            channel.queue_declare(queue=f"{queue_name}.dlq", durable=True)
            
            # Enlazar DLQ al DLX
            channel.queue_bind(
                queue=f"{queue_name}.dlq",
                exchange='dlx',
                routing_key=f"{queue_name}.dlq"
            )

        bindings = {
            IMAGE_PROCESSING_QUEUE: 'image_processing',
            OCR_PROCESSING_QUEUE: 'ocr_processing',
            ANTHROPIC_FALLBACK_QUEUE: 'anthropic_fallback',
            RESULTS_QUEUE: 'results'  # Este es el binding crítico que falta
        }

        for queue, routing_key in bindings.items():
            logger.info(f"Creando binding: {queue} -> {BALLOT_PROCESSING_EXCHANGE} con routing key: {routing_key}")
            channel.queue_bind(
                queue=queue,
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key=routing_key
            )

        logger.info("Conectado exitosamente a RabbitMQ")
        return True
    except Exception as e:
        logger.error(f"Error al conectar con RabbitMQ: {e}")
        connection = None
        channel = None
        return False

def process_image_validation(ch, method, properties, body):
    """Procesa un mensaje de validación de imagen"""
    try:
        message = json.loads(body)
        ballot_id = message.get('ballotId')
        image_base64 = message.get('imageBuffer')
        
        logger.info(f"Procesando validación de acta: {ballot_id}")
        
        # Decodificar imagen desde base64
        image_data = base64.b64decode(image_base64)
        img_array = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("No se pudo decodificar la imagen")
        
        # 1. Generar hash para identificación única
        import hashlib
        image_hash = hashlib.sha256(image_data).hexdigest()
        
        # 2. Convertir a escala de grises
        from algorithms.processing import preprocess_image
        processed_img = preprocess_image(img)
        
        # 3. Validar si es un acta electoral

        is_valid, confidence, reason = check_if_ballot(processed_img)
        
        if is_valid:
            # Si es válida, publicar a la cola de OCR
            _, buffer = cv2.imencode('.jpg', processed_img)
            processed_image_base64 = base64.b64encode(buffer).decode('utf-8')
            
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='ocr_processing',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'imageHash': image_hash,
                    'processedImageBuffer': processed_image_base64,
                    'validationConfidence': confidence
                }),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Mensaje persistente
                    content_type='application/json'
                )
            )
            
            logger.info(f"Acta {ballot_id} validada (confianza: {confidence:.2f}) y enviada a OCR")
        else:
            # Si no es válida, publicar respuesta de rechazo
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='results',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'status': 'REJECTED',
                    'reason': reason,
                    'confidence': confidence
                }),
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type='application/json'
                )
            )
            
            logger.info(f"Acta {ballot_id} rechazada: {reason}")
        
        # Confirmar procesamiento
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        logger.error(f"Error procesando validación: {str(e)}")
        # Rechazar mensaje y enviar a DLQ
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

def process_ocr_extraction(ch, method, properties, body):
    """Procesa un mensaje de extracción OCR"""
    try:
        message = json.loads(body)
        ballot_id = message.get('ballotId')
        processed_image_base64 = message.get('processedImageBuffer')
        validation_confidence = message.get('validationConfidence', 0.0)
        
        logger.info(f"Procesando extracción OCR para acta: {ballot_id}")
        
        # Decodificar imagen procesada
        image_data = base64.b64decode(processed_image_base64)
        
        # Iniciar extracción de datos
        extraction_result = ballot_extractor.extract_data(image_data)
        
        # IMPORTANTE: Convertir tipos NumPy a tipos nativos de Python
        def numpy_to_python(obj):
            if isinstance(obj, dict):
                return {k: numpy_to_python(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [numpy_to_python(item) for item in obj]
            elif isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
                return int(obj)
            elif isinstance(obj, (np.floating, np.float64, np.float32)):
                return float(obj)
            elif isinstance(obj, (np.bool_, np.bool)):
                return bool(obj)
            elif isinstance(obj, np.ndarray):
                return numpy_to_python(obj.tolist())
            else:
                return obj
        
        # Convertir el resultado completo
        extraction_result = numpy_to_python(extraction_result)
        
        if not extraction_result['success']:
            logger.error(f"Error en extracción: {extraction_result.get('errorMessage', 'Desconocido')}")
            # Enviar a anthropic si falla la extracción local
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='anthropic_fallback',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'imageBuffer': processed_image_base64,
                    'error': extraction_result.get('errorMessage', 'Error en extracción')
                }),
                properties=pika.BasicProperties(delivery_mode=2)
            )
        elif extraction_result['confidence'] < 0.7 and 'anthropic' not in extraction_result.get('source', ''):
            # Si la confianza es baja y no viene de Anthropic, enviar a fallback
            logger.info(f"Baja confianza en extracción ({extraction_result['confidence']:.2f}), enviando a Anthropic")
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='anthropic_fallback',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'imageBuffer': processed_image_base64,
                    'ocrResult': extraction_result
                }),
                properties=pika.BasicProperties(delivery_mode=2)
            )
        else:
            # Enviar resultados finales
            logger.info(f"Extracción completada con éxito (fuente: {extraction_result.get('source', 'ocr')})")
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='results',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'status': 'COMPLETED',
                    'results': {
                        'tableCode': extraction_result['results'].get('tableCode', ''),
                        'tableNumber': extraction_result['results'].get('tableNumber', ''),
                        'votes': extraction_result['results'].get('votes', {}),
                        'location': extraction_result['results'].get('location', {
                            'department': '',
                            'province': '',
                            'municipality': '',
                            'locality': '',
                            'pollingPlace': ''
                        }),
                    },
                    'confidence': extraction_result['confidence'],
                    'source': extraction_result.get('source', 'ocr'),
                    'needsHumanVerification': extraction_result.get('needsHumanVerification', extraction_result['confidence'] < 0.7)
                }),
                properties=pika.BasicProperties(delivery_mode=2)
            )

        # Confirmar procesamiento
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        logger.error(f"Error en procesamiento OCR: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Rechazar mensaje
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

def process_anthropic_fallback(ch, method, properties, body):
    """Procesa un mensaje de fallback a Anthropic"""
    try:
        message = json.loads(body)
        ballot_id = message.get('ballotId')
        image_base64 = message.get('imageBuffer')
        
        logger.info(f"Procesando fallback Anthropic para acta: {ballot_id}")
        
        # Decodificar imagen
        image_data = base64.b64decode(image_base64)
        
        # Usar el fallback de Anthropic
        from algorithms.anthropic_fallback import AnthropicExtractor
        extractor = AnthropicExtractor()
        result = extractor.extract_data_from_image(image_data)
        
        # Convertir tipos NumPy a tipos Python nativos
        def numpy_to_python(obj):
            if isinstance(obj, dict):
                return {k: numpy_to_python(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [numpy_to_python(item) for item in obj]
            elif isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
                return int(obj)
            elif isinstance(obj, (np.floating, np.float64, np.float32)):
                return float(obj)
            elif isinstance(obj, (np.bool_, np.bool)):
                return bool(obj)
            elif isinstance(obj, np.ndarray):
                return numpy_to_python(obj.tolist())
            else:
                return obj
        
        result = numpy_to_python(result)
        print(result['results'])
        
        if 'results' in result and result['results']:
            # Enviar resultados finales
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='results',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'status': 'COMPLETED',
                    'results': {
                        'tableCode': result['results'].get('tableCode', ''),
                        'tableNumber': result['results']['tableNumber'],
                        'votes': result['results']['votes'],
                        'location': result['results'].get('location', {
                            'department': '',
                            'province': '',
                            'municipality': '',
                            'locality': '',
                            'pollingPlace': ''
                        }),
                    },
                    'confidence': result['confidence'],
                    'source': 'anthropic',
                    'needsHumanVerification': result.get('needsHumanVerification', result['confidence'] < 0.7)
                }),
                properties=pika.BasicProperties(delivery_mode=2)
            )
            logger.info(f"Extracción Anthropic completada con éxito")
            # Confirmar solo si tuvimos éxito
            ch.basic_ack(delivery_tag=method.delivery_tag)
        else:
            # Si falló Anthropic, informar error y rechazar mensaje para enviarlo a DLQ
            channel.basic_publish(
                exchange=BALLOT_PROCESSING_EXCHANGE,
                routing_key='results',
                body=json.dumps({
                    'ballotId': ballot_id,
                    'status': 'EXTRACTION_FAILED',
                    'error': result.get('error', 'Error en extracción Anthropic'),
                    'source': 'anthropic_error'
                }),
                properties=pika.BasicProperties(delivery_mode=2)
            )
            logger.error(f"Error en extracción Anthropic: {result.get('error', 'Desconocido')}")
            # CAMBIO: Rechazamos el mensaje para enviarlo a DLQ
            ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
        
    except Exception as e:
        logger.error(f"Error en fallback Anthropic: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Rechazar mensaje
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

def start_consuming():
    """Inicia el consumo de mensajes de las colas"""
    if not channel:
        logger.error("No hay conexión a RabbitMQ para iniciar consumo")
        return False
    
    try:
        # Configurar consumidores con prefetch para no sobrecargarse
        channel.basic_qos(prefetch_count=1)
        
        # Consumidor para cada cola
        channel.basic_consume(
            queue=IMAGE_PROCESSING_QUEUE,
            on_message_callback=process_image_validation
        )
        
        channel.basic_consume(
            queue=OCR_PROCESSING_QUEUE,
            on_message_callback=process_ocr_extraction
        )
        
        channel.basic_consume(
            queue=ANTHROPIC_FALLBACK_QUEUE,
            on_message_callback=process_anthropic_fallback
        )
        
        logger.info("Iniciando consumo de mensajes...")
        channel.start_consuming()
    except Exception as e:
        logger.error(f"Error al iniciar consumo: {e}")
        return False

def run_worker():
    """Función principal para ejecutar el worker"""
    while True:
        try:
            if connect_to_rabbitmq():
                start_consuming()
            else:
                logger.error("No se pudo establecer conexión con RabbitMQ")
        except Exception as e:
            logger.error(f"Error en el worker: {e}")
        
        # Si llegamos aquí, es porque hubo un error o se cerró la conexión
        logger.info("Reintentando conexión en 5 segundos...")
        time.sleep(5)

# Iniciar worker en hilo independiente
def start_worker_thread():
    worker_thread = threading.Thread(target=run_worker)
    worker_thread.daemon = True
    worker_thread.start()
    return worker_thread

if __name__ == "__main__":
    # Cuando se ejecuta directamente, solo inicia el worker
    run_worker()