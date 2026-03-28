
import csv
import json
import re

def clean_html(raw_html):
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    return cleantext

def generate_primary_name(exercise_name):
    unnecessary_words = ["bodyweight", "machine", "assisted", "single", "neutral", "grip", "cable", "dumbbell", "barbell"]
    name_parts = exercise_name.lower().split()
    primary_name_parts = [part for part in name_parts if part not in unnecessary_words]
    primary_name = ' '.join(primary_name_parts)
    # common substitutions
    if 'curl' in primary_name:
        return 'bicep curl'
    if 'push up' in primary_name or 'pushup' in primary_name:
        return 'push up'
    if 'pull up' in primary_name or 'pullup' in primary_name:
        return 'pull up'
    if 'squad' in primary_name:
        return 'squat'
    return primary_name.strip()

def generate_aliases(exercise_name, primary_name, muscle):
    aliases = set()
    aliases.add(primary_name)
    
    # Add variations from name
    name_parts = exercise_name.lower().split()
    if len(name_parts) > 1:
        aliases.add(name_parts[0])
        aliases.add(" ".join(name_parts[:2]))

    # short forms
    if "push up" in exercise_name.lower():
        aliases.add("pushup")
    if "pull up" in exercise_name.lower():
        aliases.add("pullup")

    # muscle-based
    aliases.add(f"{muscle.lower()} {primary_name.split()[-1]}")
    aliases.add(f"{muscle.lower()} exercise")


    # ensure at least 3, can be improved with more logic
    while len(aliases) < 3:
        if len(name_parts) > 0:
            aliases.add(name_parts.pop(0))
        else:
            break

    return list(aliases)


def process_exercises(input_file, output_file):
    exercises_dict = {}
    with open(input_file, 'r', encoding='utf-8-sig') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            name = row['Exercise'].strip()
            if not name:
                continue

            exercise_id = name.lower().replace(' ', '_')
            muscle = row['Muscle Group'].strip()
            
            # If already exists, skip or merge. For this use-case, we merge muscle groups.
            if exercise_id in exercises_dict:
                existing = exercises_dict[exercise_id]
                # Merge muscle groups if different
                if muscle and muscle not in existing["muscle"]:
                    existing["muscle"] += f", {muscle}"
                continue

            equipment_raw = row['Equipment'].strip()
            
            # Simple equipment text extraction
            equipment = clean_html(equipment_raw)
            if 'Dumbbells' in equipment:
                equipment = 'Dumbbells'
            elif 'Barbell' in equipment:
                equipment = 'Barbell'
            elif 'Kettlebell' in equipment:
                equipment = 'Kettlebell'
            elif 'Machine' in equipment or 'Cables' in equipment:
                equipment = 'Machine'
            elif 'Bodyweight' in equipment or not equipment:
                equipment = 'Bodyweight'
            else:
                # Last word as fallback
                equipment = equipment.split(' ')[-1]

            difficulty = row['Difficulty'].strip()
            
            primary_name = generate_primary_name(name)
            
            tokens = [word.lower() for word in name.split()]
            
            aliases = generate_aliases(name, primary_name, muscle)
            
            search_text_parts = [primary_name] + aliases + tokens + [name]
            search_text = ' '.join(list(set([p.lower() for p in search_text_parts])))

            exercise_entry = {
                "id": exercise_id,
                "name": name,
                "primary": primary_name,
                "aliases": aliases,
                "tokens": tokens,
                "muscle": muscle,
                "equipment": equipment,
                "difficulty": difficulty,
                "searchText": search_text
            }
            exercises_dict[exercise_id] = exercise_entry

    with open(output_file, 'w', encoding='utf-8') as jsonfile:
        json.dump(list(exercises_dict.values()), jsonfile, indent=2)

if __name__ == '__main__':
    # The input file is in the root directory, so we go up one level.
    process_exercises('../Verified_MuscleWiki_Data.csv', 'exercises/exercises_processed.json')

