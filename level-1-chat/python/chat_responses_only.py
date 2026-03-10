import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

client = OpenAI(
    base_url=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
)

model = os.getenv("MODEL_NAME", "gpt-5.2")
instructions = os.getenv(
    "CHATBOT_INSTRUCTIONS",
    "You are a helpful assistant. Be concise and friendly.",
)

previous_response_id = None

while True:
    try:
        response = client.responses.create(
            model=model,
            input=input("You: "),
            instructions=instructions,
            previous_response_id=previous_response_id,
        )
    except (EOFError, KeyboardInterrupt):
        print("\nGoodbye!")
        break

    print(f"Assistant: {response.output_text}\n")
    previous_response_id = response.id
