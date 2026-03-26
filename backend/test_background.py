from chat_service import chat_with_coach
import time

messages = [
    {"role": "user", "parts": ["Hi"]},
    {"role": "assistant", "parts": ["Hello! What is your age?"]},
    {"role": "user", "parts": ["25"]},
    {"role": "assistant", "parts": ["Height?"]},
    {"role": "user", "parts": ["175 cm"]},
    {"role": "assistant", "parts": ["Weight?"]},
    {"role": "user", "parts": ["70 kg"]},
    {"role": "assistant", "parts": ["Goal?"]},
    {"role": "user", "parts": ["Build Muscle"]},
    {"role": "assistant", "parts": ["Equipment?"]},
    {"role": "user", "parts": ["With Equipment"]},
    {"role": "assistant", "parts": ["Medical?"]},
    {"role": "user", "parts": ["None"]},
    {"role": "assistant", "parts": ["Focus Areas?"]},
    {"role": "user", "parts": ["Chest, Abs"]},
    {"role": "assistant", "parts": ["[START_FILTERING] Goal: Build Muscle, Equipment: With Equipment, Targets: Chest, Abs\nFood preference?"]},
    {"role": "user", "parts": ["Non veg"]},
    {"role": "assistant", "parts": ["[START_PLAN_GEN] Summary: Goal: Build Muscle, Equip: With Equipment, Veg: No\nHow much water do you drink?"]},
    {"role": "user", "parts": ["2 liters"]},
    {"role": "assistant", "parts": ["Sleep?"]},
    {"role": "user", "parts": ["8 hours"]},
    {"role": "assistant", "parts": ["Active?"]},
    {"role": "user", "parts": ["Yes"]},
    {"role": "assistant", "parts": ["Stress?"]},
    {"role": "user", "parts": ["Low"]}
]

print("Simulating final turn resolving to [PLAN_READY]...")
response = chat_with_coach(messages, uid="test_sim_1")

print("\n--- Final Output ---")
print(response)

# Wait a few seconds for background threads just in case
time.sleep(15)

# Trigger plan ready manually since background threading would drop it in actual use context
final_messages = messages + [{"role": "assistant", "parts": ["[PLAN_READY]"]}]
print("\n--- Triggering PLAN_READY manually ---")
response2 = chat_with_coach(final_messages, uid="test_sim_1")

print(response2)
