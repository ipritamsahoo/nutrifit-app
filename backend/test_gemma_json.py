from chat_service import chat_with_coach, extract_plan_from_response

history = [
    {"role": "user", "parts": ["I am ready. I am 25 years old, weigh 70kg, 175cm tall. I want to build muscle. I have no medical conditions. I like weightlifting. I eat everything. Please generate the COMPLETE fitness plan in EXACT JSON format NOW. Do not ask me any more questions."]}
]

print("Calling chat_with_coach...")
response_text = chat_with_coach(history)

print("---------------- RESPONSE ----------------")
print(response_text)
print("------------------------------------------")

plan = extract_plan_from_response(response_text)
if plan:
    print("PLAN EXTRACTED SUCCESSFULLY!")
else:
    print("FAILED TO EXTRACT PLAN.")
