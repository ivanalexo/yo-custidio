# image_processor/app.py
from flask import Flask, request, jsonify
import base64
import numpy as np
import cv2
from algorithms.extractor import BallotExtractor
from algorithms.processing import check_if_ballot
from worker import start_worker_thread
import logging
import hashlib

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('BallotAPI')

app = Flask(__name__)
ballot_extractor = BallotExtractor()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/process', methods=['POST'])
def process_image():
    """Endpoint para procesar imágenes directamente"""
    if 'image' not in request.json:
        return jsonify({"error": "No image data provided"}), 400
    
    debug_mode = request.json.get('debug', False)
    # solo para probar
    force_valid = request.json.get('forceValid', False)
        
    try:
        # Decodificar la imagen desde base64
        logger.info("Recibida solicitud de procesamiento de imagen")
        
        try:
            image_data = base64.b64decode(request.json['image'])
            logger.info(f"Imagen decodificada, tamaño: {len(image_data)} bytes")
        except Exception as decode_error:
            logger.error(f"Error decodificando imagen base64: {decode_error}")
            return jsonify({"error": f"Error decodificando imagen: {decode_error}"}), 400
        
        # Verificar los módulos antes de extraer datos
        try:
            logger.info("Verificando si los módulos necesarios están disponibles")
            # Importar los módulos principales para verificar que están disponibles
            import algorithms
            from algorithms.extractor import BallotExtractor
            from algorithms.processing import preprocess_image_for_anthropic
            from algorithms.template_matching import identify_acta_structure
            logger.info("Módulos importados correctamente")
        except ImportError as import_error:
            logger.error(f"Error importando módulos: {import_error}")
            return jsonify({"error": f"Error de importación de módulos: {import_error}"}), 500
        
        # IMPORTANTE: Modificar esta parte para SOLO procesar imagen y validarla,
        # SIN intentar extracción directa con Anthropic
        logger.info("Iniciando procesamiento de imagen")
        img_array = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        # Usar preprocesamiento mínimo para mantener calidad de imagen
        processed_img = preprocess_image_for_anthropic(img)

        # Verificar si es un acta válida
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        is_valid, confidence, reason = check_if_ballot(gray)

        # Generar hash para identificación
        image_hash = hashlib.sha256(image_data).hexdigest()
        
        # Preparar respuesta con la imagen procesada mínimamente
        if len(processed_img.shape) == 3:
            _, buffer = cv2.imencode('.jpg', processed_img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        else:
            _, buffer = cv2.imencode('.jpg', processed_img)
        processed_image_base64 = base64.b64encode(buffer).decode('utf-8')
        
        if len(processed_img.shape) == 3:
            height, width, _ = processed_img.shape
        else:
            height, width = processed_img.shape
        
        response = {
            "imageHash": image_hash,
            "processedImage": processed_image_base64,
            "dimensions": {
                "width": width,
                "height": height
            },
            "validation": {
                "isValid": is_valid,
                "confidence": confidence,
                "reason": reason if not is_valid else None
            }
        }

        logger.info("Envío de respuesta exitosa")
        return jsonify(response), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error no manejado: {e}")
        logger.error(f"Traceback: {error_details}")
        return jsonify({
            "error": str(e),
            "details": error_details if debug_mode else "Habilite el modo debug para ver detalles"
        }), 500

@app.route('/manual-retry-dlq', methods=['POST'])
def manual_retry_dlq():
    """Endpoint para reintentar manualmente mensajes de DLQ"""
    try:
        data = request.json
        dlq_name = data.get('dlqName')
        target_queue = data.get('targetQueue')
        count = data.get('count', 10)
        
        if not dlq_name or not target_queue:
            return jsonify({"error": "Se requieren dlqName y targetQueue"}), 400
        
        # Importar funcionalidad de retry desde módulo de worker
        from worker import connection, channel, connect_to_rabbitmq
        
        if not channel:
            if not connect_to_rabbitmq():
                return jsonify({"error": "No se pudo conectar a RabbitMQ"}), 500
        
        # Procesar mensajes
        processed = 0
        for i in range(count):
            message = channel.basic_get(dlq_name, auto_ack=False)
            if not message or not message[0]:
                break  # No más mensajes
            
            method, properties, body = message
            
            # Publicar a la cola destino
            channel.basic_publish(
                exchange='',
                routing_key=target_queue,
                body=body,
                properties=pika.BasicProperties(delivery_mode=2)
            )
            
            # Confirmar procesamiento
            channel.basic_ack(delivery_tag=method.delivery_tag)
            processed += 1
        
        return jsonify({
            "success": True,
            "processed": processed,
            "message": f"Se procesaron {processed} mensajes de {dlq_name} a {target_queue}"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Iniciar worker en un hilo separado
    worker_thread = start_worker_thread()
    
    # Iniciar servidor Flask
    app.run(host='0.0.0.0', port=5000)