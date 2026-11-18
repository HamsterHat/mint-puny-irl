import os
import shutil

# Укажите путь к файлу wiki-bridge.js
file_path = "public/wiki/wiki-bridge.js"
bak_path = file_path + ".bak"

# Проверяем, существует ли оригинальный файл
if not os.path.exists(file_path):
    print(f"Ошибка: Файл '{file_path}' не найден. Проверьте путь.")
else:
    # 1. Создаем резервную копию (.bak) перед любыми действиями
    try:
        # Если папка существует, создаем бэкап рядом с оригиналом
        shutil.copy2(file_path, bak_path)
        print(f"Резервная копия успешно создана: '{bak_path}'")
    except Exception as e:
        print(f"Не удалось создать резервную копию: {e}")
        exit(1)

    # 2. Читаем содержимое оригинального файла
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Задаем строку поиска и строку замены
    old_str = "requestedPage=typeof options==='string'?options:options.articleId??null;ensure();previousFocus=document.activeElement;\n    if(!dialog.open)dialog.showModal();"
    new_str = "requestedPage=typeof options==='string'?options:options.articleId??null;ensure();\n    if(!dialog.open){previousFocus=document.activeElement;dialog.showModal();}"

    # 3. Применяем исправление
    if old_str in content:
        content = content.replace(old_str, new_str)
        
        # 4. Сохраняем обновленный файл
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Успешно! Исправление фокуса для wiki-bridge.js применено.")
    else:
        print("Изменения не требовались (строка не найдена или код уже исправлен).")
