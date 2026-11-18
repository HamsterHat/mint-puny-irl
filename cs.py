import os

paths = {
    'book': '<path d="M5 6h8c3 0 5 2 5 4v18c0-3-3-4-5-4H5zM31 6h-8c-3 0-5 2-5 4v18c0-3 3-4 5-4h8z"/>',
    'roles': '<circle cx="13" cy="11" r="5"/><circle cx="26" cy="12" r="4"/><path d="M3 29v-4c0-6 5-9 10-9s10 3 10 9v4zM24 20c5 0 8 3 8 7v2h-5"/>',
    'leaf': '<path d="M28 5C12 4 4 12 7 22c4 10 22 7 21-17zM8 27l15-16M14 20l-1-7M19 15h7"/>',
    'bolt': '<path d="M20 3 7 20h10l-2 13 15-19H20z"/>',
    'star': '<path d="m18 3 4.5 9.5L33 14l-7.5 7.5 1.7 10.5L18 27l-9.2 5 1.7-10.5L3 14l10.5-1.5z"/>',
    'link': '<path d="m14 22 8-8M13 27l-2 2a7 7 0 0 1-10-10l8-8a7 7 0 0 1 10 0M23 9l2-2a7 7 0 0 1 10 10l-8 8a7 7 0 0 1-10 0" transform="translate(0 -1) scale(.95)"/>',
    'coin': '<circle cx="18" cy="18" r="13"/><path d="M21 10h-6v16M15 11h5a5 5 0 0 1 0 10h-5M10 17h12"/>',
    'menu': '<path d="M6 9h24M6 18h24M6 27h24"/>',
    'reload': '<path d="M29 14a12 12 0 1 0-2 13M29 5v10H19"/>',
    'close': '<path d="m9 9 18 18M27 9 9 27"/>',
    'search': '<circle cx="15" cy="15" r="9"/><path d="m22 22 10 10"/>',
    'note': '<circle cx="18" cy="18" r="14"/><path d="M18 16v11M18 9v1"/>',
    'important': '<path d="m18 3 15 15-15 15L3 18zM18 11v10M18 26v1"/>',
    'warning': '<path d="m18 4 15 27H3zM18 13v9M18 26v1"/>',
    'caution': '<path d="M12 3h12l9 9v12l-9 9H12l-9-9V12zM18 10v12M18 27v1"/>',
    'tip': '<path d="M12 23c0-4-5-6-5-12a11 11 0 0 1 22 0c0 6-5 8-5 12zM12 27h12M14 31h8M18 5v3"/>',
    'example': '<path d="M8 6h20v24H8zM13 12h10M13 18h10M13 24h6"/>',
    'theme': '<path d="M29 23A13 13 0 0 1 13 6 13 13 0 1 0 29 23z"/>'
}

colors = {
    'note': '#7eafd4', 
    'tip': '#79ba94', 
    'important': '#a895d9', 
    'warning': '#d0a54b', 
    'caution': '#d48686', 
    'example': '#94aab4'
}

# 1. Автоматически создаем папку для иконок, если её еще нет
output_dir = "public/wiki/icons"
os.makedirs(output_dir, exist_ok=True)

# 2. Генерируем и записываем каждый файл на диск
for name, p in paths.items():
    color = colors.get(name, '#79ab91')
    
    # Формируем полный путь к файлу
    file_path = os.path.join(output_dir, f"{name}.svg")
    
    # Содержимое SVG
    svg_content = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">{p}</svg>\n'
    
    # Записываем в файл
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

print(f"Все иконки ({len(paths)} шт.) успешно сохранены в папку: {output_dir}")
