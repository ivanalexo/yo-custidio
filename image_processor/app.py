# image_processor/app.py
from flask import Flask, request, jsonify
import cv2
import numpy as np
import hashlib
import base64
import io
from PIL import Image

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/process', methods=['POST'])
def process_image():
    if 'image' not in request.json:
        return jsonify({"error": "No image data provided"}), 400
    
    debug_mode = request.json.get('debug', False)
    force_valid = request.json.get('forceValid', False)
        
    try:
        # Decodificar la imagen desde base64
        image_data = base64.b64decode(request.json['image'])
        img_array = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({"error": "No se pudo decodificar la imagen"}), 400
                
        # Generar hash para detectar duplicados
        image_hash = hashlib.sha256(image_data).hexdigest()
                
        # Procesar la imagen
        processed_img = optimize_image(img)
                
        # Si se fuerza la validación, no realizar verificaciones
        if force_valid:
            validation_result = {
                "isValid": True,
                "confidence": 1.0,
                "message": "Validación forzada por el usuario"
            }
        else:
            # Validar si es un acta electoral
            validation_result = is_ballot_valid(processed_img, img)
        
        # Si está en modo debug, añadir visualizaciones de las detecciones
        if debug_mode:
            debug_images = generate_debug_images(img, processed_img)
            validation_result['debug'] = debug_images
                
        # Codificar la imagen procesada a base64
        _, buffer = cv2.imencode('.jpg', processed_img)
        processed_image_base64 = base64.b64encode(buffer).decode('utf-8')
                
        response = {
            "imageHash": image_hash,
            "processedImage": processed_image_base64,
            "dimensions": {
                "width": int(processed_img.shape[1]),  # Convertir a int nativo
                "height": int(processed_img.shape[0])  # Convertir a int nativo
            },
            "validation": convert_numpy_types(validation_result)  # Convertir tipos NumPy
        }
                
        return jsonify(response), 200
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return jsonify({
            "error": str(e),
            "details": error_details if debug_mode else "Habilite el modo debug para ver detalles"
        }), 500

def convert_numpy_types(obj):
    """
    Convierte todos los tipos de NumPy a tipos nativos de Python para que sean serializables a JSON.
    """
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list) or isinstance(obj, tuple):
        return [convert_numpy_types(i) for i in obj]
    else:
        return obj

def optimize_image(img):
    # Verificar si la imagen es a color
    if len(img.shape) == 3:
        # Convertir a escala de grises
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        # Ya está en escala de grises
        gray = img.copy()
        
    # Redimensionar a máximo 1200x1200px para mejorar rendimiento
    height, width = gray.shape
    if height > 1200 or width > 1200:
        scale = min(1200.0/width, 1200.0/height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        resized = cv2.resize(gray, (new_width, new_height))
    else:
        resized = gray
    
    # Mejorar contraste con ecualización adaptativa de histograma
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    optimized = clahe.apply(resized)
    
    # Reducir ruido
    denoised = cv2.fastNlMeansDenoising(optimized, None, 10, 7, 21)
    
    return denoised

def generate_debug_images(original_img, processed_img):
    """
    Genera imágenes de debug para visualización de las detecciones
    """
    debug_data = {}
    
    # 1. Detectar líneas horizontales y verticales
    _, binary = cv2.threshold(processed_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 30))
    v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
    
    # Combinar líneas
    combined_lines = cv2.add(h_lines, v_lines)
    
    # Crear imagen a color para visualización
    height, width = processed_img.shape
    debug_visualization = cv2.cvtColor(processed_img, cv2.COLOR_GRAY2BGR)
    
    # 2. Detectar ROI del logo
    logo_roi = original_img[0:min(int(height*0.25), 200), 0:min(int(width*0.25), 200)]
    
    # 3. Detectar cuadrícula de votación
    # Dibujar rectángulos en regiones de interés
    cv2.rectangle(debug_visualization, 
                 (int(width*0.2), int(height*0.25)), 
                 (int(width*0.8), int(height*0.8)), 
                 (0, 255, 0), 2)  # ROI de cuadrícula de votación
    
    cv2.rectangle(debug_visualization, 
                 (0, 0), 
                 (min(int(width*0.25), 200), min(int(height*0.25), 200)), 
                 (255, 0, 0), 2)  # ROI de logo
    
    # Codificar imágenes debug a base64
    _, buffer1 = cv2.imencode('.jpg', binary)
    _, buffer2 = cv2.imencode('.jpg', combined_lines)
    _, buffer3 = cv2.imencode('.jpg', debug_visualization)
    
    if logo_roi.size > 0:
        _, buffer4 = cv2.imencode('.jpg', logo_roi)
        debug_data['logo_roi'] = base64.b64encode(buffer4).decode('utf-8')
    
    debug_data['binary'] = base64.b64encode(buffer1).decode('utf-8')
    debug_data['lines'] = base64.b64encode(buffer2).decode('utf-8')
    debug_data['visualization'] = base64.b64encode(buffer3).decode('utf-8')
    
    return debug_data

def optimize_image(img):
    # Convertir a escala de grises
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
    # Redimensionar a máximo 1000x1000px
    height, width = gray.shape
    if height > 1000 or width > 1000:
        scale = min(1000.0/width, 1000.0/height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        resized = cv2.resize(gray, (new_width, new_height))
    else:
        resized = gray
        
    # Mejorar contraste
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    optimized = clahe.apply(resized)
        
    return optimized

def is_ballot_valid(gray_img, original_img):
    try:
        # VERIFICACIÓN INICIAL RÁPIDA
        # Para filtrar imágenes que claramente no son actas electorales
        quick_check = quick_ballot_check(gray_img, original_img)
        if not quick_check["isValid"]:
            return {
                "isValid": False,
                "confidence": 0.1,
                "reason": quick_check["reason"]
            }
        
        # Resultados individuales para diagnóstico
        validation_results = {}
        
        # 1. Verificar que es un documento rectangular
        rect_check = check_rectangular_document(gray_img)
        validation_results["rectangular_check"] = rect_check
        
        # 2. Verificar estructura de tabla electoral
        table_check = check_table_structure(gray_img)
        validation_results["table_check"] = table_check
        
        # 3. Buscar características específicas de actas electorales
        electoral_features = check_electoral_features(gray_img, original_img)
        validation_results["electoral_features"] = electoral_features
        
        # Contabilizar cuántas verificaciones pasaron
        valid_checks = 0
        if rect_check["isValid"]:
            valid_checks += 1
        if table_check["isValid"]:
            valid_checks += 1
        if electoral_features["isValid"]:
            valid_checks += 1
        
        # Calcular confianza global basada en los resultados individuales
        confidence_values = [
            rect_check["confidence"],
            table_check["confidence"],
            electoral_features["confidence"]
        ]
        overall_confidence = float(sum(confidence_values) / len(confidence_values))
        
        # CRITERIOS MÁS ESTRICTOS:
        # - Debe tener al menos 2 verificaciones
        # - Si solo tiene 2, debe incluir características electorales específicas
        # - La confianza total debe ser al menos 0.5
        
        is_valid = False
        reason = ""
        
        if valid_checks >= 3 and overall_confidence > 0.55:
            # Todas las verificaciones pasaron con buena confianza
            is_valid = True
        elif valid_checks >= 2 and electoral_features["isValid"] and overall_confidence > 0.5:
            # Al menos dos verificaciones incluyendo características electorales
            is_valid = True
        elif 'features' in electoral_features and electoral_features["features"]["officialLogo"] and table_check["isValid"]:
            # Se detectó el logo oficial Y estructura de tabla
            is_valid = True
            overall_confidence = float(max(overall_confidence, 0.6))  # Ajustar confianza hacia arriba
        else:
            # No es válido, determinar la razón
            if not rect_check["isValid"]:
                reason = "Documento no tiene forma rectangular adecuada"
            elif not table_check["isValid"]:
                reason = "No se detectó estructura de tabla electoral"
            else:
                reason = electoral_features.get("reason", "No se identificaron suficientes características de acta electoral")
        
        # VERIFICACIÓN FINAL ESTRICTA
        # Si la imagen es válida según criterios anteriores, verificamos características obligatorias
        if is_valid and 'features' in electoral_features:
            features = electoral_features["features"]
            # Para ser válida, DEBE tener al menos una de estas características definitivas
            key_features = [
                features.get("officialLogo", False),  # Logo OEP
                features.get("votingGrid", False) and features.get("barcode", False)  # Cuadrícula + código de barras
            ]
            
            if not any(key_features):
                is_valid = False
                reason = "Falta logo oficial o estructura de votación característica de actas electorales"
                overall_confidence = float(min(overall_confidence, 0.4))
        
        # Asegurarse de que todos los valores son tipos nativos de Python
        is_valid = bool(is_valid)
        overall_confidence = float(overall_confidence)
        
        # Mantener diagnóstico detallado para depuración
        result = {
            "isValid": is_valid,
            "confidence": overall_confidence,
            "validChecks": int(valid_checks),
            "details": convert_numpy_types(validation_results)
        }
        
        if not is_valid and reason:
            result["reason"] = reason
            
        return result
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return {
            "isValid": False,
            "confidence": 0.0,
            "reason": f"Error técnico: {str(e)}",
            "details": error_details
        }

def quick_ballot_check(gray_img, color_img):
    """
    Realiza una verificación rápida para filtrar imágenes que claramente no son actas electorales.
    Retorna diccionario con isValid=False si la imagen falla la verificación rápida.
    """
    height, width = gray_img.shape
    
    # 1. Verificar relación de aspecto (las actas electorales son documentos rectangulares)
    aspect_ratio = width / height
    if aspect_ratio < 0.5 or aspect_ratio > 2.0:
        return {
            "isValid": False,
            "reason": "La relación de aspecto no corresponde a un documento de acta electoral"
        }
    
    # 2. Verificar presencia mínima de líneas rectas (característica de documentos tabulares)
    # Aplicar borde de Canny para detectar bordes
    edges = cv2.Canny(gray_img, 50, 150, apertureSize=3)
    
    # Detectar líneas usando transformada de Hough
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=100, maxLineGap=10)
    
    # Si no hay suficientes líneas rectas largas, probablemente no es un acta
    if lines is None or len(lines) < 10:
        return {
            "isValid": False,
            "reason": "No se detectaron suficientes líneas rectas características de documentos tabulares"
        }
    
    # 3. Verificar existencia de texto (las actas tienen mucho texto)
    # Umbralizar para detectar texto (texto oscuro sobre fondo claro)
    _, text_mask = cv2.threshold(gray_img, 180, 255, cv2.THRESH_BINARY_INV)
    
    # Calcular porcentaje de píxeles de texto
    text_percentage = np.sum(text_mask > 0) / (width * height)
    
    # Las actas tienen una densidad típica de texto (ni muy alta ni muy baja)
    if text_percentage < 0.05 or text_percentage > 0.3:
        return {
            "isValid": False,
            "reason": "La densidad de texto no corresponde a un documento de acta electoral"
        }
    
    # 4. Verificar diversidad de colores (si tenemos imagen a color)
    if len(color_img.shape) == 3:
        # Convertir a HSV para analizar colores
        try:
            hsv = cv2.cvtColor(color_img, cv2.COLOR_BGR2HSV)
            
            # Calcular histograma de tonalidad (Hue)
            hist = cv2.calcHist([hsv], [0], None, [30], [0, 180])
            
            # Normalizar histograma
            hist = hist / np.sum(hist)
            
            # Calcular el número de colores significativos (con más del 5% de presencia)
            significant_colors = np.sum(hist > 0.05)
            
            # Las fotos de personas/paisajes suelen tener más diversidad de colores
            # que documentos como actas
            if significant_colors > 7:
                return {
                    "isValid": False,
                    "reason": "La distribución de colores no corresponde a un documento formal"
                }
        except:
            # Si hay error en la conversión de color, ignoramos esta verificación
            pass
    
    # Si pasa todas las verificaciones rápidas, continuar con el proceso detallado
    return {"isValid": True}

def check_rectangular_document(img):
    # Enfoque más flexible para detectar documentos rectangulares
    
    # Aplicar umbral para binarizar la imagen
    _, thresh = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Encontrar contornos
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Si no hay contornos, no es válido
    if not contours:
        return {"isValid": False, "confidence": 0.1}
    
    # Buscar el contorno más grande
    max_area = 0
    max_contour = None
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if area > max_area:
            max_area = area
            max_contour = contour
    
    # Verificar si encontramos un contorno significativo
    img_area = img.shape[0] * img.shape[1]
    if max_contour is None or max_area < (img_area * 0.3):  # Reducido a 30%
        return {"isValid": False, "confidence": 0.2}
    
    # Aproximar el contorno a un polígono
    epsilon = 0.03 * cv2.arcLength(max_contour, True)  # Más tolerante
    approx = cv2.approxPolyDP(max_contour, epsilon, True)
    
    # Un documento puede tener entre 4 y 8 vértices (más tolerante)
    # A veces la aproximación puede detectar más vértices debido a la calidad de la imagen
    is_rectangular = 3 <= len(approx) <= 8
    
    # Calcular confianza basada en la forma y el área relativa
    shape_confidence = 0.8 if len(approx) == 4 else 0.6  # Preferencia por cuadriláteros
    area_confidence = min(0.9, max_area / img_area)
    confidence = float((shape_confidence + area_confidence) / 2)
    
    # Siempre considerar válido si el contorno cubre una gran parte de la imagen
    if max_area > (img_area * 0.8):
        is_rectangular = True
        confidence = float(max(confidence, 0.7))
    
    return {"isValid": bool(is_rectangular), "confidence": confidence}

def check_table_structure(img):
    # Aplicar umbral para binarizar - ajustado para mayor sensibilidad
    _, binary = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Detectar líneas horizontales - kernel más pequeño para detectar líneas más finas
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 1))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    
    # Detectar líneas verticales - kernel más pequeño para detectar líneas más finas
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 30))
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
    
    # Combinar líneas horizontales y verticales
    table_structure = cv2.add(horizontal, vertical)
    
    # Contar líneas
    h_lines = count_lines(horizontal)
    v_lines = count_lines(vertical)
    
    # Las actas electorales suelen tener varias líneas horizontales y verticales
    # Reducimos el umbral mínimo para ser más flexibles
    has_enough_lines = h_lines >= 4 and v_lines >= 3
    
    # Calcular confianza basada en número de líneas
    # Una acta típica tiene al menos 8 líneas horizontales y 5 verticales
    h_confidence = float(min(1.0, h_lines / 8))
    v_confidence = float(min(1.0, v_lines / 5))
    confidence = float((h_confidence + v_confidence) / 2)
    
    # Si tenemos muchas líneas, incrementamos la confianza
    if h_lines >= 8 and v_lines >= 5:
        confidence = float(min(1.0, confidence + 0.1))
    
    return {
        "isValid": bool(has_enough_lines),
        "confidence": confidence,
        "horizontalLines": int(h_lines),
        "verticalLines": int(v_lines)
    }

def check_electoral_features(gray_img, color_img):
    # Evaluación de características electorales con criterios más estrictos
    
    # 1. Buscar código de barras (común en actas electorales)
    has_barcode = bool(detect_barcode(gray_img))
    
    # 2. Detectar cuadros de votación - buscar estructuras de cuadrícula pequeña
    has_voting_grid = bool(detect_voting_grid(gray_img))
    
    # 3. Verificar la presencia de logos oficiales - buscar el logo del OEP
    has_official_logo = bool(detect_oep_logo(color_img))
    
    # 4. Detectar patrón de texto característico de las actas (áreas de texto distribuidas)
    has_text_pattern = bool(detect_text_pattern(gray_img))
    
    # 5. Verificar texto clave específico de actas electorales
    has_key_text = bool(detect_electoral_text_regions(gray_img))
    
    # 6. NUEVO: Verificar títulos específicos de actas
    has_title = bool(detect_electoral_title(gray_img))
    
    # Calcular confianza combinada - dar más peso a características definitivas
    feature_scores = [
        0.7 if has_barcode else 0.2,
        0.9 if has_voting_grid else 0.3,
        1.0 if has_official_logo else 0.3,  # Peso máximo al logo
        0.7 if has_text_pattern else 0.3,
        0.8 if has_key_text else 0.2,
        0.8 if has_title else 0.3          # Peso alto al título
    ]
    
    avg_confidence = sum(feature_scores) / len(feature_scores)
    
    # Contar características encontradas
    features_found = sum([
        has_barcode, 
        has_voting_grid, 
        has_official_logo,
        has_text_pattern,
        has_key_text,
        has_title
    ])
    
    # CRITERIOS MÁS ESTRICTOS:
    # 1. Debe tener al menos 3 características de las 6 para ser considerada válida
    # 2. Si no tiene logo oficial, debe tener al menos 4 características
    # 3. Si tiene logo oficial, debe tener al menos la cuadrícula o título electoral
    
    is_valid = False
    reason = ""
    
    # Combinación de características fuertes: Logo + (Cuadrícula o Título)
    strong_combination = has_official_logo and (has_voting_grid or has_title)
    
    # Suficientes características con buena confianza
    enough_features = features_found >= 3 and avg_confidence > 0.55
    
    # Muchas características aun sin logo
    many_features_no_logo = features_found >= 4 and not has_official_logo
    
    # Criterios para validación
    if strong_combination:
        is_valid = True
    elif enough_features and (has_official_logo or has_voting_grid):
        is_valid = True
    elif many_features_no_logo and has_voting_grid:
        is_valid = True
    else:
        reason = "No se detectaron suficientes características de un acta electoral"
    
    return {
        "isValid": is_valid,
        "confidence": float(avg_confidence),
        "reason": reason,
        "features": {
            "barcode": has_barcode,
            "votingGrid": has_voting_grid,
            "officialLogo": has_official_logo,
            "textPattern": has_text_pattern,
            "keyText": has_key_text,
            "title": has_title
        }
    }

def detect_electoral_title(img):
    """
    Detecta la presencia del título característico "ACTA ELECTORAL" o similar
    en la parte superior del documento.
    """
    height, width = img.shape
    
    # Región donde suele estar el título (parte superior central)
    title_roi = img[0:int(height*0.15), int(width*0.2):int(width*0.8)]
    
    if title_roi.size == 0:
        return False
    
    # Aplicar umbral para detectar texto oscuro sobre fondo claro
    _, thresh = cv2.threshold(title_roi, 180, 255, cv2.THRESH_BINARY_INV)
    
    # Eliminar ruido
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # Buscar componentes conectados (palabras potenciales)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    
    # Filtrar componentes por tamaño y proporción
    title_like_components = 0
    title_pattern_detected = False
    
    # Típicamente un título tiene varias palabras de tamaño similar alineadas horizontalmente
    word_heights = []
    
    for i in range(1, num_labels):  # Ignorar etiqueta 0 (fondo)
        x, y, w, h, area = stats[i]
        
        # Filtrar componentes demasiado pequeños
        if area < 20:
            continue
            
        # Aspectos típicos de palabras en títulos
        if 1.0 < w/h < 15.0:  # Palabras suelen ser más anchas que altas
            word_heights.append(h)
            title_like_components += 1
    
    # Un título suele tener varias palabras de altura similar
    if len(word_heights) >= 2:
        # Calcular altura promedio
        avg_height = sum(word_heights) / len(word_heights)
        
        # Contar palabras con altura similar
        consistent_heights = sum(1 for h in word_heights if 0.7*avg_height <= h <= 1.3*avg_height)
        
        # Si la mayoría de palabras tienen altura similar, probablemente es un título
        if consistent_heights / len(word_heights) > 0.7:
            title_pattern_detected = True
    
    # Características adicionales de títulos:
    
    # 1. Densidad de texto mayor en título que resto de la página
    title_density = np.sum(cleaned > 0) / title_roi.size
    
    # 2. Distribución horizontal del texto (debería estar centrado)
    # Proyección horizontal del texto
    h_projection = np.sum(cleaned, axis=0) / 255
    
    # Normalizar
    if np.max(h_projection) > 0:
        h_projection = h_projection / np.max(h_projection)
    
    # Dividir en tercios y comparar
    thirds_width = h_projection.shape[0] // 3
    left_third = np.sum(h_projection[:thirds_width])
    middle_third = np.sum(h_projection[thirds_width:2*thirds_width])
    right_third = np.sum(h_projection[2*thirds_width:])
    
    # Título suele estar centrado o distribuido uniformemente
    centered_text = (middle_third > left_third * 0.7 and 
                    middle_third > right_third * 0.7)
    
    # Combinar todas las características
    return (title_like_components >= 3 and title_pattern_detected) or (title_density > 0.08 and centered_text)

def detect_electoral_text_regions(img):
    """
    Detecta regiones características de texto que aparecen en actas electorales:
    - "ACTA ELECTORAL" en la parte superior
    - "CÓMPUTO DE VOTOS" en la parte central
    - Región donde aparecen los partidos políticos
    """
    height, width = img.shape
    
    # 1. Verificar región del título (suele tener "ACTA ELECTORAL")
    title_region = img[0:int(height*0.15), int(width*0.3):int(width*0.7)]
    
    # 2. Verificar región de cómputo de votos (parte central)
    compute_region = img[int(height*0.25):int(height*0.35), int(width*0.2):int(width*0.8)]
    
    # 3. Verificar región de partidos políticos (columna izquierda)
    parties_region = img[int(height*0.3):int(height*0.7), 0:int(width*0.3)]
    
    # Umbralizar para detectar texto (texto oscuro sobre fondo claro)
    _, title_thresh = cv2.threshold(title_region, 180, 255, cv2.THRESH_BINARY_INV)
    _, compute_thresh = cv2.threshold(compute_region, 180, 255, cv2.THRESH_BINARY_INV)
    _, parties_thresh = cv2.threshold(parties_region, 180, 255, cv2.THRESH_BINARY_INV)
    
    # Calcular densidad de texto en cada región
    title_density = np.sum(title_thresh) / (title_region.size * 255)
    compute_density = np.sum(compute_thresh) / (compute_region.size * 255)
    parties_density = np.sum(parties_thresh) / (parties_region.size * 255)
    
    # Valores típicos para actas electorales:
    # - Región de título: texto concentrado en el centro
    # - Región de cómputo: texto más denso en el centro horizontal
    # - Región de partidos: texto en columna con alineación vertical
    
    # Combinación de criterios
    title_pattern = title_density > 0.03 and title_density < 0.3
    compute_pattern = compute_density > 0.02 and compute_density < 0.2
    parties_pattern = parties_density > 0.03 and parties_density < 0.25
    
    # Se requiere que al menos 2 de los 3 patrones coincidan
    patterns_found = sum([title_pattern, compute_pattern, parties_pattern])
    
    return patterns_found >= 2

def detect_barcode(img):
    # Detector mejorado de código de barras para actas electorales
    height, width = img.shape
    
    # Método 1: Buscar patrones de líneas verticales (código de barras tradicional)
    # Aplicar umbral
    _, thresh = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Kernel para detectar patrones de líneas verticales próximas
    barcode_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))
    detected = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, barcode_kernel)
    
    # Dilatar para conectar líneas cercanas
    dilated = cv2.dilate(detected, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1)))
    
    # Encontrar contornos
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Filtrar contornos que podrían ser códigos de barras
    barcode_candidates = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h > 0 else 0
        
        # Un código de barras suele ser más ancho que alto, pero no extremadamente
        if 1.5 < aspect_ratio < 10 and w > width * 0.05:
            barcode_candidates.append(contour)
    
    # Método 2: Verificar regiones específicas donde suelen estar los códigos en actas
    # Región izquierda superior (código de mesa)
    left_region = img[0:int(height*0.3), 0:int(width*0.25)]
    left_detected = has_barcode_pattern(left_region)
    
    # Región derecha superior (código de verificación)
    right_region = img[0:int(height*0.15), int(width*0.7):width]
    right_detected = has_barcode_pattern(right_region)
    
    # Combinamos los resultados de ambos métodos
    return len(barcode_candidates) > 0 or left_detected or right_detected

def has_barcode_pattern(region):
    # Analiza si una región específica tiene patrones similares a un código de barras
    if region.size == 0:
        return False
        
    # Aplicar umbral
    _, thresh = cv2.threshold(region, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Gradient para detectar cambios rápidos (característicos de códigos de barras)
    gradient_x = cv2.Sobel(thresh, cv2.CV_16S, 1, 0, ksize=3)
    abs_gradient_x = cv2.convertScaleAbs(gradient_x)
    
    # Contar transiciones de blanco a negro (alto en códigos de barras)
    # Muestreamos algunas filas
    rows_to_sample = min(5, region.shape[0])
    row_indices = np.linspace(0, region.shape[0]-1, rows_to_sample, dtype=int)
    
    total_transitions = 0
    for row_idx in row_indices:
        row = abs_gradient_x[row_idx, :]
        transitions = np.sum(row > 50)  # Umbral para considerar un cambio significativo
        total_transitions += transitions
    
    avg_transitions = total_transitions / rows_to_sample
    
    # Un código de barras suele tener muchas transiciones
    return avg_transitions > 10

def detect_voting_grid(img):
    # Método más estricto para detectar cuadrículas de votación
    
    # Aplicar umbral adaptativo para captar detalles finos
    thresh = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    # Eliminar ruido
    kernel = np.ones((2, 2), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # MÉTODO 1: DETECCIÓN POR CONTORNOS DE CELDAS
    contours, _ = cv2.findContours(opening, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    # Colectar información sobre posibles celdas de cuadrícula
    cell_rects = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < 10 or h < 10 or w > 80 or h > 80:  # Filtrado más estricto
            continue
            
        aspect_ratio = float(w) / h if h > 0 else 0
        
        # Mantener celdas más cuadradas
        if 0.7 < aspect_ratio < 1.5:
            cell_rects.append((x, y, w, h))
    
    # MÉTODO 2: BUSCAR CUADRÍCULAS POR AGRUPAMIENTO DE CELDAS
    # Buscar celdas alineadas horizontal o verticalmente
    aligned_rows = 0
    aligned_cols = 0
    
    if len(cell_rects) > 5:  # Necesitamos suficientes celdas para analizar alineación
        # Ordenar por coordenada y
        sorted_by_y = sorted(cell_rects, key=lambda c: c[1])
        
        # Buscar filas de celdas (celdas con coordenada y similar)
        rows = []
        current_row = [sorted_by_y[0]]
        
        for i in range(1, len(sorted_by_y)):
            prev_y = sorted_by_y[i-1][1]
            curr_y = sorted_by_y[i][1]
            
            # Si la diferencia en y es pequeña, considerar parte de la misma fila
            if abs(curr_y - prev_y) < max(sorted_by_y[i-1][3], sorted_by_y[i][3]) * 0.7:
                current_row.append(sorted_by_y[i])
            else:
                # Nueva fila
                if len(current_row) > 0:
                    rows.append(current_row)
                current_row = [sorted_by_y[i]]
        
        # Añadir la última fila
        if len(current_row) > 0:
            rows.append(current_row)
        
        # Contar filas con al menos 3 celdas
        aligned_rows = sum(1 for row in rows if len(row) >= 3)
        
        # Similar para columnas
        sorted_by_x = sorted(cell_rects, key=lambda c: c[0])
        columns = []
        current_col = [sorted_by_x[0]]
        
        for i in range(1, len(sorted_by_x)):
            prev_x = sorted_by_x[i-1][0]
            curr_x = sorted_by_x[i][0]
            
            if abs(curr_x - prev_x) < max(sorted_by_x[i-1][2], sorted_by_x[i][2]) * 0.7:
                current_col.append(sorted_by_x[i])
            else:
                if len(current_col) > 0:
                    columns.append(current_col)
                current_col = [sorted_by_x[i]]
        
        if len(current_col) > 0:
            columns.append(current_col)
            
        aligned_cols = sum(1 for col in columns if len(col) >= 3)
    
    # MÉTODO 3: BUSCAR PATRONES DE LÍNEAS QUE FORMAN GRIDS
    # Detectar líneas horizontales y verticales
    h, w = img.shape
    
    # Región central: donde suelen estar los cuadros de votación
    roi_y_start = int(h * 0.25)
    roi_y_end = int(h * 0.85)
    roi_x_start = int(w * 0.2)
    roi_x_end = int(w * 0.8)
    
    center_roi = img[roi_y_start:roi_y_end, roi_x_start:roi_x_end]
    
    grid_by_lines = False
    if center_roi.size > 0:
        _, binary = cv2.threshold(center_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
        h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
        
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 25))
        v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
        
        h_line_count = count_lines(h_lines)
        v_line_count = count_lines(v_lines)
        
        # Una cuadrícula de votación debe tener múltiples líneas en ambas direcciones
        grid_by_lines = h_line_count >= 5 and v_line_count >= 3  # Más estricto
    
    # MÉTODO 4: ANÁLISIS DE DISTRIBUCIÓN DE CELDAS
    # Las cuadrículas de votación reales tienen una distribución específica
    cells_distribution = False
    
    if len(cell_rects) > 12:  # Suficientes celdas para analizar distribución
        # Las celdas de votación suelen distribuirse uniformemente
        # Calcular distancias entre celdas adyacentes
        sorted_by_y = sorted(cell_rects, key=lambda c: c[1])
        y_diffs = [sorted_by_y[i+1][1] - sorted_by_y[i][1] for i in range(len(sorted_by_y)-1)]
        
        if y_diffs:
            # Calcular desviación estándar normalizada
            mean_y_diff = sum(y_diffs) / len(y_diffs)
            if mean_y_diff > 0:
                std_y_diff = sum((d - mean_y_diff)**2 for d in y_diffs) / len(y_diffs)
                std_y_diff = (std_y_diff ** 0.5) / mean_y_diff  # Normalizada
                
                # Cuadrículas uniformes tienen baja desviación estándar
                if std_y_diff < 0.5:
                    cells_distribution = True
    
    # CRITERIOS MÁS ESTRICTOS PARA DETECCIÓN POSITIVA:
    # 1. Tener suficientes contornos de celdas potenciales
    has_enough_cells = len(cell_rects) >= 12  # Más estricto
    
    # 2. Tener múltiples filas/columnas alineadas de celdas
    has_aligned_cells = aligned_rows >= 3 and aligned_cols >= 2  # Más estricto
    
    # 3. Detectar un patrón claro de líneas formando cuadrícula
    has_grid_pattern = grid_by_lines
    
    # 4. Distribución uniforme de celdas
    has_uniform_distribution = cells_distribution
    
    # Necesitamos cumplir criterios más estrictos:
    # Debe tener suficientes celdas Y (alineación o patrón de líneas o distribución uniforme)
    return has_enough_cells and (has_aligned_cells or has_grid_pattern or has_uniform_distribution)

def detect_oep_logo(color_img):
    # Detección más estricta del logo OEP en actas electorales bolivianas
    
    # Verificar dimensiones
    if color_img is None:
        return False
    
    # Convertir a escala de grises si es una imagen en color
    if len(color_img.shape) == 3:
        try:
            gray_img = cv2.cvtColor(color_img, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(color_img, cv2.COLOR_BGR2HSV)
        except:
            # Si hay error en la conversión, trabajamos directamente con la imagen original
            gray_img = color_img
            hsv = None
    else:
        gray_img = color_img
        hsv = None
    
    # Región de interés (esquina superior izquierda donde suele estar el logo)
    height, width = gray_img.shape
    roi_y_end = min(int(height*0.25), 200)  # Hasta 25% o 200px
    roi_x_end = min(int(width*0.25), 200)   # Hasta 25% o 200px
    
    roi = gray_img[0:roi_y_end, 0:roi_x_end]
    
    # No continuar si la ROI está vacía
    if roi.size == 0:
        return False
    
    # Método 1: Detección por forma (más estricta)
    logo_by_shape = check_logo_shape(roi)
    
    # Método 2: Detección por patrones de color (más estricta)
    logo_by_color = False
    if hsv is not None:
        # Definir rangos de color para el logo
        # 1. Azul-gris (color principal del logo OEP)
        lower_blue = np.array([100, 30, 30])  # Más restrictivo
        upper_blue = np.array([140, 255, 255]) # Más restrictivo
        
        # Crear máscara de color
        mask_blue = cv2.inRange(hsv[0:roi_y_end, 0:roi_x_end], lower_blue, upper_blue)
        
        # Si hay suficientes píxeles del color esperado en la ROI
        blue_pixels = np.count_nonzero(mask_blue)
        logo_by_color = blue_pixels > 50  # Aumentado el umbral
    
    # Método 3: Buscar texto "OEP" mediante análisis de patrones de píxeles
    # Este es un enfoque para buscar regiones de texto oscuro en fondo claro
    # típicamente encontradas en el logo OEP
    _, thresh = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Eliminar ruido
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # Buscar regiones de texto que podrían contener "OEP"
    text_regions = np.sum(cleaned > 0)
    text_density = text_regions / roi.size
    
    # El texto "OEP" suele ocupar entre 1% y 8% de la región superior izquierda
    logo_by_text = 0.01 < text_density < 0.08
    
    # Método 4: Buscar círculos (el logo OEP tiene forma circular)
    circles = cv2.HoughCircles(
        roi, 
        cv2.HOUGH_GRADIENT, 
        dp=1, 
        minDist=20, 
        param1=50, 
        param2=30, 
        minRadius=15, 
        maxRadius=80
    )
    
    logo_by_circle = circles is not None and len(circles) > 0
    
    # CRITERIO MÁS ESTRICTO: Se necesitan al menos 2 métodos positivos
    detection_count = sum([logo_by_shape, logo_by_color, logo_by_text, logo_by_circle])
    
    return detection_count >= 2  # Más estricto: ahora necesita 2 métodos positivos

def check_logo_shape(roi):
    # Método alternativo para detectar el logo por su forma característica
    # Útil cuando la imagen es de baja calidad o los colores están distorsionados
    
    if roi.size == 0:
        return False
    
    # Aplicar umbral adaptativo
    thresh = cv2.adaptiveThreshold(roi, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    # Encontrar contornos
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Filtrar contornos por tamaño y forma
    logo_candidates = 0
    for contour in contours:
        area = cv2.contourArea(contour)
        # Ignorar contornos muy pequeños o muy grandes
        if area < 50 or area > (roi.shape[0] * roi.shape[1] * 0.5):
            continue
            
        # Obtener rectángulo delimitador
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = float(w) / h if h > 0 else 0
        
        # El logo OEP suele tener una proporción específica
        # y estar cerca del borde superior izquierdo
        if 0.5 < aspect_ratio < 2.0:
            logo_candidates += 1
    
    return logo_candidates >= 1

def detect_text_pattern(img):
    # Las actas tienen un patrón característico de distribución de texto
    # Simplificamos buscando áreas de alta densidad de píxeles en ciertas regiones
    
    # Umbral para texto (en actas, el texto suele ser oscuro sobre fondo claro)
    _, text_mask = cv2.threshold(img, 180, 255, cv2.THRESH_BINARY_INV)
    
    # Dividir la imagen en regiones y contar píxeles de texto en cada una
    h, w = text_mask.shape
    grid_size = 4  # 4x4 grid
    region_h, region_w = h // grid_size, w // grid_size
    
    text_regions = 0
    for i in range(grid_size):
        for j in range(grid_size):
            region = text_mask[i*region_h:(i+1)*region_h, j*region_w:(j+1)*region_w]
            if np.count_nonzero(region) > (region_h * region_w * 0.03):  # Si más del 3% son píxeles de texto
                text_regions += 1
    
    # Las actas tienen texto distribuido en varias regiones
    return text_regions >= 8

def count_lines(bin_img):
    # Método optimizado para contar líneas, combinando múltiples enfoques
    
    # 1. Usar Transformada de Hough para líneas (funciona bien con líneas largas y rectas)
    lines_hough = cv2.HoughLinesP(bin_img, 1, np.pi/180, threshold=50, minLineLength=50, maxLineGap=20)
    hough_count = 0 if lines_hough is None else len(lines_hough)
    
    # 2. Contar cambios en perfiles de intensidad (enfoque alternativo)
    # Esta técnica es más efectiva para líneas débiles o discontinuas
    
    # Calcular el perfil horizontal (suma de filas)
    h_profile = np.sum(bin_img, axis=1) / 255
    
    # Calcular el perfil vertical (suma de columnas)
    v_profile = np.sum(bin_img, axis=0) / 255
    
    # Normalizar perfiles
    if np.max(h_profile) > 0:
        h_profile = h_profile / np.max(h_profile)
    
    if np.max(v_profile) > 0:
        v_profile = v_profile / np.max(v_profile)
    
    # Suavizar perfiles
    h_profile_smooth = np.convolve(h_profile, np.ones(5)/5, mode='same')
    v_profile_smooth = np.convolve(v_profile, np.ones(5)/5, mode='same')
    
    # Detectar picos (representan líneas)
    h_peaks = detect_peaks(h_profile_smooth)
    v_peaks = detect_peaks(v_profile_smooth)
    
    # Combinar resultados de ambos métodos
    # Usar el mayor conteo, pero no menos que un mínimo de líneas detectadas por Hough
    profile_count = max(len(h_peaks), len(v_peaks))
    
    # Elegir el mejor resultado
    if hough_count > profile_count:
        return hough_count
    else:
        return max(profile_count, 2)  # Al menos 2 líneas

def detect_peaks(x):
    # Detecta picos en un array 1D
    # Útil para encontrar líneas en perfiles de intensidad
    
    # Suavizado y normalización
    if len(x) < 3:
        return []
    
    # Calcular la primera derivada
    dx = np.gradient(x)
    
    # Buscar cruces por cero (de positivo a negativo)
    # Esto indica máximos locales
    peaks = []
    for i in range(1, len(dx)):
        if dx[i-1] > 0 and dx[i] <= 0:
            # Asegurarse de que el pico es significativo (valor > umbral)
            if x[i] > 0.2:  # El pico debe tener al menos 20% de la intensidad máxima
                peaks.append(i)
    
    return peaks

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)