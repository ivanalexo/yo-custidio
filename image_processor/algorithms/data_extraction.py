# image_processor/data_extraction.py
import cv2
import numpy as np
import pytesseract
import re
from algorithms.processing import preprocess_image
from algorithms.template_matching import identify_acta_structure

def extract_data_from_ballot(image):
    """Extrae datos de un acta electoral procesada"""
    # 1. Preprocesar la imagen
    processed_image = preprocess_image(image)
    
    # 2. Identificar la estructura y obtener regiones de interés
    roi_map = identify_acta_structure(processed_image)
    
    # 3. Extraer datos de cada región
    data = {}
    confidence_scores = {}
    
    # 3.1 Extraer código de mesa
    code_roi = extract_roi(processed_image, roi_map['codigo_mesa'])
    table_number = extract_text_from_region(code_roi, 'numeric')
    data['tableNumber'] = table_number
    confidence_scores['tableNumber'] = calculate_confidence(code_roi)
    
    # 3.2 Extraer votos por partido
    party_votes = []
    party_keys = [key for key in roi_map.keys() if key.startswith('partido_')]
    
    for key in party_keys:
        party_id = key.replace('partido_', '')
        party_roi = extract_roi(processed_image, roi_map[key])
        votes = extract_text_from_region(party_roi, 'numeric')
        confidence = calculate_confidence(party_roi)
        
        try:
            votes_int = int(votes) if votes.strip() else 0
        except ValueError:
            votes_int = 0
            
        party_votes.append({
            'partyId': party_id,
            'votes': votes_int,
            'confidence': confidence
        })
    
    # 3.3 Extraer totales
    valid_roi = extract_roi(processed_image, roi_map['votos_validos'])
    valid_votes = extract_text_from_region(valid_roi, 'numeric')
    valid_confidence = calculate_confidence(valid_roi)
    
    blank_roi = extract_roi(processed_image, roi_map['votos_blancos'])
    blank_votes = extract_text_from_region(blank_roi, 'numeric')
    blank_confidence = calculate_confidence(blank_roi)
    
    null_roi = extract_roi(processed_image, roi_map['votos_nulos'])
    null_votes = extract_text_from_region(null_roi, 'numeric')
    null_confidence = calculate_confidence(null_roi)
    
    # 4. Estructurar datos
    data['votes'] = {
        'partyVotes': party_votes,
        'validVotes': int(valid_votes) if valid_votes.strip() and valid_votes.isdigit() else 0,
        'blankVotes': int(blank_votes) if blank_votes.strip() and blank_votes.isdigit() else 0,
        'nullVotes': int(null_votes) if null_votes.strip() and null_votes.isdigit() else 0
    }
    
    confidence_scores['validVotes'] = valid_confidence
    confidence_scores['blankVotes'] = blank_confidence
    confidence_scores['nullVotes'] = null_confidence
    
    # 5. Verificar consistencia lógica y calcular confianza general
    consistency_score = verify_data_consistency(data)
    avg_confidence = sum([
        confidence_scores['tableNumber'],
        valid_confidence,
        blank_confidence,
        null_confidence,
        *[pv['confidence'] for pv in party_votes]
    ]) / (4 + len(party_votes))
    
    overall_confidence = avg_confidence * consistency_score
    
    return {
        'results': data,
        'confidence': overall_confidence,
        'needsManualVerification': overall_confidence < 0.7
    }

def extract_roi(image, roi_info):
    """Extrae una región de interés específica de la imagen"""
    x, y, w, h = roi_info['x'], roi_info['y'], roi_info['w'], roi_info['h']
    return image[y:y+h, x:x+w]

def extract_text_from_region(roi, mode='text'):
    """Extrae texto de una región usando OCR con configuración optimizada"""
    if roi.size == 0:
        return ""
    
    # Aplicar optimizaciones según el tipo de texto
    if mode == 'numeric':
        # Configuración especial para dígitos
        processed_roi = preprocess_digits(roi)
        
        # Configuración específica para dígitos
        config = r'--oem 1 --psm 7 -c tessedit_char_whitelist=0123456789 -l spa'
        
        # Realizar múltiples pases con diferentes configuraciones y elegir el mejor resultado
        results = []
        
        # Pase 1: Configuración estándar
        text1 = pytesseract.image_to_string(processed_roi, config=config)
        if text1.strip() and text1.strip().isdigit():
            results.append(text1.strip())
        
        # Pase 2: Invertir colores
        inverted_roi = cv2.bitwise_not(processed_roi)
        text2 = pytesseract.image_to_string(inverted_roi, config=config)
        if text2.strip() and text2.strip().isdigit():
            results.append(text2.strip())
        
        # Pase 3: Cambiar modo PSM a 8 (un solo word)
        config3 = r'--oem 1 --psm 8 -c tessedit_char_whitelist=0123456789 -l spa'
        text3 = pytesseract.image_to_string(processed_roi, config=config3)
        if text3.strip() and text3.strip().isdigit():
            results.append(text3.strip())
        
        # Pase 4: Redimensionar x2
        h, w = processed_roi.shape
        enlarged_roi = cv2.resize(processed_roi, (w*2, h*2), interpolation=cv2.INTER_CUBIC)
        text4 = pytesseract.image_to_string(enlarged_roi, config=config)
        if text4.strip() and text4.strip().isdigit():
            results.append(text4.strip())
        
        # Elegir el resultado más probable
        if not results:
            return ""
            
        # Si hay múltiples resultados, elegir el más frecuente
        from collections import Counter
        counter = Counter(results)
        most_common = counter.most_common(1)[0][0]
        return most_common
    else:
        # Optimizar para texto general
        processed_roi = preprocess_text(roi)
        
        # Configuración para texto general
        config = r'--oem 1 --psm 6 -l spa+eng'
        text = pytesseract.image_to_string(processed_roi, config=config)
        
        # Limpiar resultado
        text = clean_text(text, mode)
        
        return text

def preprocess_digits(image):
    """Optimiza una imagen para reconocimiento de dígitos"""
    # 1. Redimensionar (ampliar) para mejor reconocimiento
    height, width = image.shape
    scale_factor = 4  # Aumentar el factor de escala
    resized = cv2.resize(image, (width*scale_factor, height*scale_factor), interpolation=cv2.INTER_CUBIC)
    
    # 2. Aplicar filtro bilateral para reducir ruido pero mantener bordes
    denoised = cv2.bilateralFilter(resized, 9, 75, 75)
    
    # 3. Mejorar contraste
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # 4. Binarizar con umbral de Otsu
    _, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 5. También binarizar con umbral adaptativo
    adaptive = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10
    )
    
    # 6. Combinar ambos resultados para mayor robustez
    combined = cv2.bitwise_or(otsu, adaptive)
    
    # 7. Eliminar ruido pequeño
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel)
    
    # 8. Dilatar ligeramente para conectar partes de dígitos
    dilated = cv2.dilate(cleaned, kernel, iterations=1)
    
    # 9. Aplicar cierre morfológico para llenar huecos dentro de los dígitos
    closed = cv2.morphologyEx(dilated, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    
    return closed

def preprocess_text(image):
    """Optimiza una imagen para reconocimiento de texto general"""
    # Similar a preprocess_digits pero con parámetros ajustados para texto
    height, width = image.shape
    resized = cv2.resize(image, (width*2, height*2), interpolation=cv2.INTER_CUBIC)
    
    # Umbral adaptativo con parámetros para texto
    binary = cv2.adaptiveThreshold(
        resized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 8
    )
    
    # Eliminar ruido
    kernel = np.ones((1, 1), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    
    return cleaned

def clean_text(text, mode='text'):
    """Limpia y normaliza el texto extraído"""
    # Eliminar espacios y saltos de línea
    text = text.strip()
    
    if mode == 'numeric':
        # Extraer solo dígitos
        digits = re.sub(r'\D', '', text)
        return digits
    
    # Para texto general, normalizar espacios
    text = re.sub(r'\s+', ' ', text)
    return text

def calculate_confidence(roi):
    """Calcula un score de confianza para la región de OCR"""
    if roi.size == 0:
        return 0.0
    
    # 1. Calcular la intensidad media (para estimar claridad)
    mean_intensity = np.mean(roi) / 255.0
    
    # 2. Calcular la desviación estándar (para estimar contraste)
    std_intensity = np.std(roi) / 255.0
    
    # 3. Puntaje basado en la claridad y contraste
    # - Valores extremos de intensidad media (muy claro o muy oscuro) reducen confianza
    # - Mayor contraste (desviación estándar) aumenta confianza
    intensity_score = 1.0 - 2.0 * abs(mean_intensity - 0.5)
    contrast_score = min(std_intensity * 2.0, 1.0)
    
    # Combinación ponderada
    confidence = 0.4 * intensity_score + 0.6 * contrast_score
    
    return max(0.0, min(confidence, 1.0))  # Limitar entre 0 y 1

def verify_data_consistency(data):
    """Verifica la consistencia lógica de los datos extraídos"""
    # 1. Verificar que la suma de votos por partido = votos válidos
    party_votes_sum = sum(pv['votes'] for pv in data['votes']['partyVotes'])
    valid_votes = data['votes']['validVotes']
    
    consistency_score = 1.0  # Perfecto por defecto
    
    if valid_votes > 0:
        # Calcular diferencia porcentual
        difference = abs(party_votes_sum - valid_votes) / valid_votes
        
        # Reducir score basado en la diferencia
        if difference > 0.1:  # Más del 10% de diferencia
            consistency_score *= (1.0 - min(difference, 0.5))
    
    # 2. Verificar que el número de mesa es válido
    if not data['tableNumber'].isdigit() or len(data['tableNumber']) < 2:
        consistency_score *= 0.8
    
    return consistency_score