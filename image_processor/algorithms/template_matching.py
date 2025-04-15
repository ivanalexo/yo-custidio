# image_processor/template_matching.py
import cv2
import numpy as np

def identify_acta_structure(image):
    """Identifica la estructura del acta y devuelve una transformación para alinearla"""
    # 1. Buscar el logo OEP en la esquina superior izquierda
    logo_coords = locate_oep_logo(image)
    
    # 2. Buscar códigos de barras para referencia
    barcode_coords = locate_barcodes(image)
    
    # 3. Buscar las secciones clave de la tabla (encabezado, columnas de partidos)
    table_coords = locate_table_structure(image)
    
    # 4. Generar un mapa de coordenadas para regiones de interés
    return generate_roi_map(image, logo_coords, barcode_coords, table_coords)

def locate_oep_logo(image):
    """Localiza el logo OEP en la imagen"""
    height, width = image.shape
    
    # El logo OEP está en la esquina superior izquierda
    # Buscar en aproximadamente un 10% de la imagen
    roi_height = int(height * 0.1)
    roi_width = int(width * 0.1)
    logo_roi = image[0:roi_height, 0:roi_width]
    
    # Binarizar la región
    _, binary = cv2.threshold(logo_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Buscar contornos
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if contours:
        # Tomar el contorno más grande
        max_contour = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(max_contour)
        return (x, y, w, h)
    
    return (0, 0, 0, 0)  # No se encontró el logo

def locate_barcodes(image):
    """Localiza los códigos de barras en la imagen"""
    # Buscar patrones de líneas verticales próximas (típico de códigos de barras)
    _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Detectar bordes verticales (códigos de barras)
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 20))
    detected_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
    
    # Dilatar para conectar líneas cercanas
    dilated = cv2.dilate(detected_lines, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 1)))
    
    # Encontrar contornos
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    barcodes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        # Filtrar por tamaño y relación de aspecto típicos de códigos de barras
        if w > 50 and h > 20 and w/h > 1.5:
            barcodes.append((x, y, w, h))
    
    return barcodes

def locate_table_structure(image):
    """Identifica la estructura de la tabla electoral"""
    # 1. Binarizar la imagen
    _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 2. Detectar líneas horizontales y verticales
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    vertical_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
    
    # 3. Combinar líneas
    table_structure = cv2.add(horizontal_lines, vertical_lines)
    
    # 4. Detectar intersecciones (celdas de la tabla)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    intersections = cv2.dilate(table_structure, kernel)
    
    # 5. Encontrar contornos de la tabla
    contours, _ = cv2.findContours(intersections, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # 6. Obtener el bounding box general de la tabla
    if not contours:
        return (0, 0, 0, 0)
        
    all_contours = np.concatenate(contours)
    x, y, w, h = cv2.boundingRect(all_contours)
    
    return (x, y, w, h)

def generate_roi_map(image, logo_coords, barcode_coords, table_coords):
    """Genera un mapa de regiones de interés basado en la estructura detectada"""
    height, width = image.shape
    
    # Adaptado específicamente al formato del acta electoral boliviana
    # basado en las imágenes proporcionadas
    roi_map = {
        # Código de mesa (en la parte superior izquierda)
        'codigo_mesa': {
            'x': int(width * 0.15),
            'y': int(height * 0.125),
            'w': int(width * 0.15),
            'h': int(height * 0.05)
        },
        # Regiones de ubicacion
        'departamento': {
            'x': int(width * 0.28),
            'y': int(height * 0.14),
            'w': int(width * 0.15),
            'h': int(height * 0.03)
        },
                'provincia': {
            'x': int(width * 0.28),
            'y': int(height * 0.15),
            'w': int(width * 0.15),
            'h': int(height * 0.03)
        },
        'municipio': {
            'x': int(width * 0.28),
            'y': int(height * 0.16),
            'w': int(width * 0.15),
            'h': int(height * 0.03)
        },
        'localidad': {
            'x': int(width * 0.28),
            'y': int(height * 0.17),
            'w': int(width * 0.15),
            'h': int(height * 0.03)
        },
        'recinto': {
            'x': int(width * 0.28),
            'y': int(height * 0.18),
            'w': int(width * 0.15),
            'h': int(height * 0.03)
        },
        # Título Presidente/a (columna izquierda)
        'presidente': {
            'x': int(width * 0.2),
            'y': int(height * 0.23),
            'w': int(width * 0.15),
            'h': int(height * 0.05)
        },
        
        # Partidos políticos (ajustado para el acta específica)
        'partido_CC': {
            'x': int(width * 0.34),
            'y': int(height * 0.26),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_FPV': {
            'x': int(width * 0.34),
            'y': int(height * 0.295),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_MTS': {
            'x': int(width * 0.34),
            'y': int(height * 0.33),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_UCS': {
            'x': int(width * 0.34),
            'y': int(height * 0.365),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_MAS': {
            'x': int(width * 0.34),
            'y': int(height * 0.4),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_21F': {
            'x': int(width * 0.34),
            'y': int(height * 0.435),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_PDC': {
            'x': int(width * 0.34),
            'y': int(height * 0.47),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_MNR': {
            'x': int(width * 0.34),
            'y': int(height * 0.505),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'partido_PAN': {
            'x': int(width * 0.34),
            'y': int(height * 0.54),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        
        # Totales
        'votos_validos': {
            'x': int(width * 0.34),
            'y': int(height * 0.585),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'votos_blancos': {
            'x': int(width * 0.34),
            'y': int(height * 0.64),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        },
        'votos_nulos': {
            'x': int(width * 0.34),
            'y': int(height * 0.675),
            'w': int(width * 0.06),
            'h': int(height * 0.035)
        }
    }
    
    # Si se detectó correctamente la estructura, ajustar las coordenadas
    if table_coords[2] > 0 and table_coords[3] > 0:
        table_x, table_y, table_w, table_h = table_coords
        
        # Ajustar regiones de interés basadas en la posición real de la tabla
        for key in roi_map:
            if key.startswith('partido_') or key.startswith('votos_'):
                # Calcular posición relativa dentro de la tabla
                rel_x = (roi_map[key]['x'] - table_x) / table_w
                rel_y = (roi_map[key]['y'] - table_y) / table_h
                
                # Ajustar posición basada en la tabla detectada
                roi_map[key]['x'] = int(table_x + rel_x * table_w)
                roi_map[key]['y'] = int(table_y + rel_y * table_h)
    
    return roi_map