# image_processor/algorithms/extractor.py
import logging
import cv2
import numpy as np
import hashlib
import re
import base64

# Importar funciones de los otros módulos
from algorithms.processing import check_if_ballot, preprocess_image
from algorithms.template_matching import identify_acta_structure
from algorithms.anthropic_fallback import AnthropicExtractor
from algorithms.data_extraction import extract_data_from_ballot


class BallotExtractor:
    def __init__(self):
        import os
        self.anthropic_enabled = os.environ.get('ENABLE_ANTHROPIC_FALLBACK', 'true').lower() == 'true'
        self.confidence_threshold = float(os.environ.get('OCR_CONFIDENCE_THRESHOLD', '0.8'))
        self.anthropic_extractor = AnthropicExtractor() if self.anthropic_enabled else None
    
    def extract_data(self, image_buffer):
        """Extrae datos de un acta electoral usando el método óptimo"""
        try:
            # 1. Convertir buffer a imagen
            logger = logging.getLogger('Extractor OCR')
            
            img_array = np.frombuffer(image_buffer, np.uint8)
            image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("No se pudo decodificar la imagen")
            
            # 2. Generar hash para identificación única
            image_hash = hashlib.sha256(image_buffer).hexdigest()
            
            # 3. Convertir a escala de grises
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image.copy()
            
            # 4. Preprocesar imagen
            processed_img = preprocess_image(gray)
            
            # 5. Verificar si es un acta electoral
            is_valid, confidence, reason = check_if_ballot(processed_img)
            
            if not is_valid and not self.anthropic_enabled:
                return {
                    'success': False,
                    'errorMessage': reason or 'La imagen no parece ser un acta electoral',
                    'confidence': confidence
                }
            
            # 6. Extraer imagen procesada para la respuesta
            _, buffer = cv2.imencode('.jpg', processed_img)
            processed_image_base64 = base64.b64encode(buffer).decode('utf-8')
            height, width = processed_img.shape
            
            # 7. Intentar extracción con OCR
            ocr_result = extract_data_from_ballot(processed_img)
            
            logger.info(f"Resultado OCR: confianza={ocr_result.get('confidence', 0)}, threshold={self.confidence_threshold}")
            
            # 8. Respuesta completa para NestJS (independientemente de la confianza del OCR)
            # Esta respuesta se envía al cliente HTTP y no afecta el procesamiento asíncrono
            response = {
                'success': True,
                'imageHash': image_hash,
                'tableNumber': ocr_result['results'].get('tableNumber', ''),
                'votes': ocr_result['results'].get('votes', {}),
                'confidence': ocr_result.get('confidence', 0),
                'source': 'ocr',  # Siempre reportamos 'ocr' en la respuesta HTTP
                'needsVerification': ocr_result.get('confidence', 0) < self.confidence_threshold,
                'processedImage': processed_image_base64,
                'dimensions': {
                    'width': width,
                    'height': height
                },
                'validation': {
                    'isValid': is_valid,
                    'confidence': confidence,
                    'reason': reason if not is_valid else None
                }
            }

            return response

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"Error en extracción: {str(e)}")
            logger.error(f"Detalles: {error_details}")

            return {
                'success': False,
                'errorMessage': str(e),
                'details': error_details
            }
