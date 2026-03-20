import httpx
import asyncio

async def run():
    msg1 = "Hey Pritam Sahoo! 👋 I'm your HonFit Virtual Coach. I'm here to create a personalized fitness and diet plan just for you!\n\nLet's start — what's your main fitness goal? Are you looking to lose weight, build muscle, stay fit, or improve flexibility?"
    
    payload = {
        'uid': 'user123',
        'messages': [
            {'role': 'model', 'text': msg1},
            {'role': 'user', 'text': 'stay fit'}
        ]
    }
    
    async with httpx.AsyncClient() as client:
        res = await client.post(
            'http://127.0.0.1:8000/chat',
            json=payload
        )
        print(f"Status: {res.status_code}")
        print(f"Body: {res.text}")

asyncio.run(run())
