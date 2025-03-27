# image_processor/anthropic_fallback.py
import base64
import json
import logging
import requests
import os
import re

class AnthropicExtractor:
    def __init__(self):
        self.api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        self.model = os.environ.get('ANTHROPIC_MODEL', 'claude-3-7-sonnet-20250219')
        self.api_url = 'https://api.anthropic.com/v1/messages'
    
    def extract_data_from_image(self, image_buffer):
        """Extrae datos de un acta electoral usando Anthropic API"""
        if not self.api_key:
            return {
                'results': None,
                'error': 'Anthropic API key no configurada',
                'confidence': 0,
                'source': 'anthropic_error'
            }

        # Convertir imagen a base64
        base64_image = base64.b64encode(image_buffer).decode('utf-8')

        # Crear prompt para la extracción
        prompt = """
        Por favor, extrae la siguiente información de esta imagen de acta electoral:

        1. Código/Número de mesa
        Solo de la sección que dice PRESIDENTE/A
        2. Información de votos:
           - Votos válidos (total)
           - Votos nulos
           - Votos blancos
           - Votos por partido político (para cada partido con su sigla correspondiente)

        Proporciona solo los números extraídos, sin explicaciones adicionales, en formato JSON con la siguiente estructura:

        {
          "tableNumber": "string",
          "votes": {
            "validVotes": number,
            "nullVotes": number,
            "blankVotes": number,
            "partyVotes": [
              {
                "partyId": "string", // Sigla del partido (ej: CC, MAS-IPSP)
                "votes": number
              }
            ]
          }
        }

        Incluye SOLO datos que puedas ver claramente en la imagen. Si no puedes ver algún valor, déjalo como null o 0.
        """

        try:
            # Hacer solicitud a la API
            response = requests.post(
                self.api_url,
                headers={
                    'Content-Type': 'application/json',
                    'x-api-key': self.api_key,
                    'anthropic-version': '2023-06-01'
                },
                json={
                    "model": self.model,
                    "max_tokens": 4096,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/jpeg",
                                        "data": base64_image
                                    }
                                }
                            ]
                        }
                    ]
                },
                timeout=60
            )
            
            logger = logging.getLogger('AnthropicExtractor')
            logger.info(f"Status Code: {response.status_code}")
            logger.info(f"Response headers: {response.headers}")
            if response.status_code != 200:
                logger.error(f"Error Body: {response.text}")

            response.raise_for_status()
            data = response.json()

            # Extraer y parsear la respuesta JSON
            if not data or 'content' not in data or not data['content']:
                raise ValueError("Respuesta de Anthropic incompleta")

            # Buscar el JSON en la respuesta de texto
            text_response = data['content'][0]['text']
            json_match = re.search(r'({[\s\S]*})', text_response)

            if not json_match:
                raise ValueError("No se encontró JSON en la respuesta")

            extracted_data = json.loads(json_match.group(1))

            return {
                'results': extracted_data,
                'confidence': 0.9,  # Alta confianza para respuestas de Anthropic
                'source': 'anthropic'
            }
        except requests.exceptions.HTTPError as e:
            logger = logging.getLogger('AnthropicExtractor')
            error_msg = f"{e.response.status_code} {e.response.reason} for url: {e.response.url}"
            logger.error(f"Error HTTP: {error_msg}")
            logger.error(f"Response content: {e.response.text}")
            
            return {
                'results': None,
                'error': error_msg,
                'confidence': 0,
                'source': 'anthropic_error'
            }

        except Exception as e:
            logger = logging.getLogger('AnthropicEXtractor')
            logger.error(f"Error general: {str(e)}")
            return {
                'results': None,
                'error': str(e),
                'confidence': 0,
                'source': 'anthropic_error'
            }