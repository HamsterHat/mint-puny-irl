import os
import re
import shutil

# Паттерн теперь ищет .png, .svg, .jpg, .jpeg или .webp внутри обратных кавычек
# (?:png|svg|jpg|jpeg|webp) — группа без захвата для перечисления расширений
PNG_IN_BACKTICKS_REGEX = re.compile(r'`([^`\s]+\.(?:png|svg|jpg|jpeg|webp))`', re.IGNORECASE)
REPLACEMENT = r'![image](\1)'

# Текущая папка, где лежит сам скрипт
current_dir = os.path.dirname(os.path.abspath(__file__))

print(f"Начинаю сканирование директории: {current_dir}\n")

processed_files = 0
modified_files = 0

for root, dirs, files in os.walk(current_dir):
    for file in files:
        if file.endswith('.md'):
            file_path = os.path.join(root, file)
            processed_files += 1
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # subn находит и заменяет все форматы (png, svg и т.д.)
                new_content, count = PNG_IN_BACKTICKS_REGEX.subn(REPLACEMENT, content)
                
                if count > 0:
                    # Создаем бэкап, только если его еще нет
                    bak_path = file_path + '.bak'
                    if not os.path.exists(bak_path):
                        shutil.copy2(file_path, bak_path)
                    
                    # Записываем обновленный текст
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    
                    print(f"[ИЗМЕНЕН] {os.path.relpath(file_path, current_dir)} (замен: {count})")
                    modified_files += 1
                
            except Exception as e:
                print(f"[ОШИБКА] Не удалось обработать файл {file_path}: {e}")

print(f"\nГотово! Всего проверено .md файлов: {processed_files}. Изменено: {modified_files}.")
