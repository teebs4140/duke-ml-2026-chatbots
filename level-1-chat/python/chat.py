"""
Level 1: Terminal Chatbot with Azure AI Foundry
================================================
This is the simplest possible AI chatbot -- a terminal conversation loop.
You type a message, the AI responds, and the conversation continues with
full memory of what was said before.

Key concepts you'll learn:
  - Connecting to Azure AI Foundry using the OpenAI SDK
  - Sending messages with the Responses API
  - Multi-turn conversation using previous_response_id
  - Configuring model behavior with reasoning effort and instructions
"""

# --- Step 1: Import libraries ---
# We only need three things:
#   - openai   : The official OpenAI Python SDK (works with Azure AI Foundry)
#   - dotenv   : Loads configuration from a .env file so we don't hard-code secrets
#   - os/Path  : Standard library helpers for environment variables and file paths
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# --- Step 2: Load environment variables ---
# The .env file lives at the project root (two levels up from this script).
# It contains your API key, endpoint URL, model name, and other settings.
# We use Path(__file__) so it works no matter where you run the script from.
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(env_path)

# Read each setting from the environment.
# os.getenv("NAME", "default") returns "default" if the variable isn't set.
ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")        # Your Azure endpoint URL
API_KEY = os.getenv("AZURE_OPENAI_API_KEY")           # Your secret API key
MODEL = os.getenv("MODEL_NAME", "gpt-5.2")            # Which model to use
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "low")  # low / medium / high
INSTRUCTIONS = os.getenv(
    "CHATBOT_INSTRUCTIONS",
    "You are a helpful assistant. Be concise and friendly.",
)

# --- Step 3: Validate configuration ---
# If the .env file is missing or incomplete, we want a clear error -- not a
# confusing traceback buried deep in the OpenAI SDK.
if not ENDPOINT or not API_KEY:
    print("ERROR: Missing configuration!")
    print(f"  Looked for .env at: {env_path}")
    print("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.")
    print("  Copy .env.example to .env and fill in your values.")
    raise SystemExit(1)

# --- Step 4: Create the OpenAI client ---
# Azure AI Foundry exposes an OpenAI-compatible API. We point the standard
# OpenAI client at it by setting base_url to your endpoint.
# This means you can use the exact same SDK you'd use with OpenAI directly.
client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY,
    max_retries=10,
)

def get_weather(location):
    """Get real weather using Open-Meteo (free, no API key needed)."""
    import httpx

    # Step 1: Geocode the location name to lat/lon
    # Open-Meteo's geocoder works best with just the city name (no state/country)
    city_name = location.split(",")[0].strip()
    geo = httpx.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": city_name, "count": 1},
    ).json()

    if not geo.get("results"):
        return json.dumps({"error": f"Could not find location: {location}"})

    place = geo["results"][0]
    lat, lon = place["latitude"], place["longitude"]
    name = place.get("name", location)

    # Step 2: Fetch current weather for those coordinates
    weather = httpx.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
        },
    ).json()

    current = weather["current"]
    return json.dumps({
        "location": name,
        "temperature": f"{current['temperature_2m']}°F",
        "humidity": f"{current['relative_humidity_2m']}%",
        "wind_speed": f"{current['wind_speed_10m']} mph",
        "weather_code": current["weather_code"],
    })

tools = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "Get the current weather for a given location.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City name, e.g. 'Durham, NC'",
                }
            },
            "required": ["location"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]

tool_mapping = {"get_weather": get_weather}

# --- Step 5: Print a welcome banner ---
# A friendly banner so the user knows the chatbot is ready and how to use it.
print("=" * 50)
print("  Level 1: Terminal Chatbot")
print("=" * 50)
print(f"  Model   : {MODEL}")
print(f"  Effort  : {REASONING_EFFORT}")
print("-" * 50)
print("  Type a message and press Enter to chat.")
print('  Type "clear" to reset the conversation.')
print('  Type "quit" or "exit" to leave.')
print("=" * 50)
print()

# --- Step 6: Run the conversation loop ---
# previous_response_id is the secret to multi-turn conversation. The API
# remembers the full conversation history on the server side -- we just pass
# back the ID of the last response so the API knows which conversation to
# continue. Setting it to None starts a brand-new conversation.
previous_response_id = None

while True:
    # 6a. Get user input
    try:
        user_input = input("You: ").strip()
    except (EOFError, KeyboardInterrupt):
        # Handle Ctrl+D (EOFError) and Ctrl+C (KeyboardInterrupt) gracefully
        print("\nGoodbye!")
        break

    # 6b. Skip empty input
    if not user_input:
        continue

    # 6c. Check for special commands
    if user_input.lower() in ("quit", "exit"):
        print("Goodbye!")
        break

    if user_input.lower() == "clear":
        # Reset the conversation by clearing the previous response ID.
        # The next message will start a fresh conversation with no history.
        previous_response_id = None
        print("Conversation cleared. Starting fresh!\n")
        continue

    # 6d. Send the message to the API
    try:
        response = client.responses.create(
            model=MODEL,                              # Which model to use
            input=user_input,                         # The user's message
            instructions=INSTRUCTIONS,                # System-level instructions
            reasoning={"effort": REASONING_EFFORT},   # How hard the model thinks
            previous_response_id=previous_response_id,  # Conversation continuity
            tools=tools,
        )

        # Handle tool calls — the model may call functions before giving a text answer
        while True:
            tool_outputs = []
            for item in response.output:
                if item.type == "function_call":
                    args = json.loads(item.arguments)
                    func = tool_mapping.get(item.name)
                    result = func(**args) if func else f"Unknown tool: {item.name}"
                    print(f"  [tool call: {item.name}({args}) → {result}]")
                    tool_outputs.append({
                        "type": "function_call_output",
                        "call_id": item.call_id,
                        "output": result,
                    })

            if not tool_outputs:
                break  # No more tool calls — model is done

            # Send tool results back using previous_response_id (server has full context)
            response = client.responses.create(
                model=MODEL,
                input=tool_outputs,
                previous_response_id=response.id,
                tools=tools,
            )

        # Print the final text response
        print(f"\nAssistant: {response.output_text}")

        if response.usage:
            print(f"  [tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out, {response.usage.total_tokens} total]")
        print()

        previous_response_id = response.id

    except Exception as e:
        # If something goes wrong, print the error but keep the loop running
        # so the user can try again or fix the issue.
        print(f"\nError: {e}\n")
