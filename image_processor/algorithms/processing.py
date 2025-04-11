# image_processor/processing.py
import cv2
import numpy as np
import hashlib
from algorithms.template_matching import locate_table_structure, locate_oep_logo, locate_barcodes

def preprocess_image(image):
    """Preprocesamiento de imagen para mejorar la calidad para OCR"""
    # 1. Convertir a escala de grises si es necesario
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # 2. Redimensionar a tamaño óptimo si es muy grande
    height, width = gray.shape
    target_dpi = 300 # DPI optimo para OCR
    if height > 3000 or width > 3000:
        scale = min(3000/width, 3000/height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        gray = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_AREA)
    elif height < 1000 or width < 1000:
        # si la images es muy pequenia, ampliarla para mejor deteccion
        scale = max(1000/width, 1000/height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        gray = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
    
    # 3. Corrección de perspectiva si es necesario
    gray = correct_perspective(gray)
    
    # 4. reducir ruido antes de mejorar contraste
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    
    # 5. Mejorar contraste con ecualización adaptativa de histograma
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    
    # 6. Ampliar umbralizacion adaptativa para mejorar texto
    binary = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY, 11, 2)
    
    #7. Operaciones morfologicas para limpiar ruido menor
    kernel = np.ones((1, 1), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    
    # 8. Cambiar imagen original con binarizada para mejore resultado
    result = cv2.bitwise_not(binary)
    
    return result

def correct_perspective(image):
    """Corrección de perspectiva para enderezar el documento"""
    # 1. Binarizar la imagen
    _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 2. Encontrar contornos
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # 3. Encontrar el contorno más grande (asumimos que es el documento)
    if not contours:
        return image  # No hay contornos, devolver la imagen original
        
    max_contour = max(contours, key=cv2.contourArea)
    
    # 4. Aproximar a un polígono para obtener los vértices
    epsilon = 0.02 * cv2.arcLength(max_contour, True)
    approx = cv2.approxPolyDP(max_contour, epsilon, True)
    
    # 5. Si no es aproximadamente un rectángulo (4 vértices), devolver imagen original
    if len(approx) != 4:
        return image
    
    # 6. Ordenar los puntos para transformar perspectiva
    rect = order_points(approx.reshape(len(approx), 2))
    
    # 7. Calcular nuevas dimensiones
    width = max(
        np.linalg.norm(rect[0] - rect[1]),
        np.linalg.norm(rect[2] - rect[3])
    )
    height = max(
        np.linalg.norm(rect[0] - rect[3]),
        np.linalg.norm(rect[1] - rect[2])
    )
    
    # 8. Definir puntos de destino
    dst = np.array([
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1]
    ], dtype=np.float32)
    
    # 9. Transformar perspectiva
    M = cv2.getPerspectiveTransform(rect.astype(np.float32), dst)
    warped = cv2.warpPerspective(image, M, (int(width), int(height)))
    
    return warped

def order_points(pts):
    """Ordenar los puntos en: superior-izquierda, superior-derecha, 
    inferior-derecha, inferior-izquierda"""
    rect = np.zeros((4, 2), dtype=np.float32)
    
    # La suma de coordenadas será mínima en superior-izquierda
    # y máxima en inferior-derecha
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    
    # La diferencia será mínima en superior-derecha
    # y máxima en inferior-izquierda
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    
    return rect

def check_if_ballot(image):
    """Verifica si una imagen es un acta electoral"""
    try:
        # 1. Verificar presencia de tablas/grillas
        from algorithms.template_matching import locate_table_structure
        table_coords = locate_table_structure(image)
        has_table = table_coords[2] > 0 and table_coords[3] > 0
            
        # 2. Verificar logo OEP
        from algorithms.template_matching import locate_oep_logo
        logo_coords = locate_oep_logo(image)
        has_logo = logo_coords[2] > 0 and logo_coords[3] > 0
            
        # 3. Verificar códigos de barras
        from algorithms.template_matching import locate_barcodes
        barcodes = locate_barcodes(image)
        has_barcodes = len(barcodes) > 0
            
        # Calcular confianza - Asegurarse de que son valores, no listas
        confidence_scores = [
            0.6 if has_table else 0.1,
            0.8 if has_logo else 0.2,
            0.5 if has_barcodes else 0.2
        ]
        
        # Esta es la línea problemática - asegurarse de que confidence_scores es una lista de números
        # Verificar que confidence_scores no sea vacío
        if not confidence_scores:
            overall_confidence = 0.0
        else:
            # Calcular suma manualmente para depuración
            total = 0.0
            for score in confidence_scores:
                if isinstance(score, (int, float)):
                    total += score
                else:
                    # Si no es un número, usar 0
                    print(f"Advertencia: encontrado un valor no numérico en confidence_scores: {score}")
            
            overall_confidence = total / len(confidence_scores)
            
        is_valid = overall_confidence >= 0.5  # Umbral de decisión
        
        reason = ""
        if not is_valid:
            if not has_table:
                reason = "No se detectó estructura de tabla electoral"
            elif not has_logo:
                reason = "No se detectó logo oficial"
            else:
                reason = "La imagen no parece ser un acta electoral"
            
        return is_valid, overall_confidence, reason
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error verificando acta: {e}")
        print(f"Detalles: {error_details}")
        return False, 0.0, f"Error técnico: {str(e)}"