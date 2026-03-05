# PRD: Add Tool Calling (Function Calling)

## Background

AI models can do more than generate text — they can **call functions** you define. This lets the model reach out to external APIs, databases, or any code you write to get real data before responding.

We validated this on the `test/tool-calling` branch using a `get_weather` tool backed by the free Open-Meteo API. Tool calling works end-to-end with Azure AI Foundry and the Responses API.

### How tool calling works

```
User: "What's the weather in Durham?"
         │
         ▼
┌─────────────────────┐
│  Model receives      │
│  message + tool      │
│  definitions         │
└────────┬────────────┘
         │ (model decides to call a tool)
         ▼
┌─────────────────────┐
│  Response contains   │
│  function_call with  │
│  name + arguments    │
│  (NOT text)          │
└────────┬────────────┘
         │ (your code runs the function)
         ▼
┌─────────────────────┐
│  You send the result │
│  back as             │
│  function_call_output│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Model writes a      │
│  natural language     │
│  response using the   │
│  tool result          │
└─────────────────────┘
```

The key insight: **the model decides _when_ to call a tool and _what arguments_ to pass, but your code provides the implementation.** The function body could be a hardcoded string, an API call, a database query — the model doesn't care, it just sees the JSON you return.

## What we validated (spike)

- Branch: `test/tool-calling`
- File modified: `level-1-chat/python/chat.py`
- Tool: `get_weather` backed by Open-Meteo (free, no API key)
- Result: works end-to-end. Model calls the tool, we execute it, send results back, model incorporates real weather data into its response.

### Gotcha discovered

Open-Meteo's geocoding API fails on `"Raleigh, NC"` but works on `"Raleigh"`. Fix: strip everything after the comma before geocoding. The model tends to pass `"City, State"` format since we describe the parameter as `"City name, e.g. 'Durham, NC'"`.

## Workshop exercise design

This should be a **new workshop exercise** — not bolted onto Level 1. Level 1 teaches the basics (connect, send, receive). Tool calling is a distinct concept.

### What to build

Add a `get_weather` tool to the terminal chatbot that fetches real weather data.

### What attendees learn

1. Defining a tool schema (JSON Schema for parameters)
2. Passing `tools=` to `responses.create()`
3. Detecting `function_call` items in the response output
4. Executing the function and returning results via `function_call_output`
5. The tool-calling loop pattern (model may call multiple tools or chain calls)

### Implementation pattern

**Define the tool schema:**
```python
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
```

**Implement the function** (calls Open-Meteo — free, no API key):
```python
def get_weather(location):
    import httpx  # already installed as openai dependency

    city_name = location.split(",")[0].strip()
    geo = httpx.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": city_name, "count": 1},
    ).json()

    if not geo.get("results"):
        return json.dumps({"error": f"Could not find location: {location}"})

    place = geo["results"][0]
    weather = httpx.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
        },
    ).json()

    current = weather["current"]
    return json.dumps({
        "location": place.get("name", location),
        "temperature": f"{current['temperature_2m']}°F",
        "humidity": f"{current['relative_humidity_2m']}%",
        "wind_speed": f"{current['wind_speed_10m']} mph",
    })
```

**Handle the tool-calling loop** (after `responses.create()`):
```python
while True:
    tool_outputs = []
    for item in response.output:
        if item.type == "function_call":
            args = json.loads(item.arguments)
            func = tool_mapping.get(item.name)
            result = func(**args) if func else f"Unknown tool: {item.name}"
            tool_outputs.append({
                "type": "function_call_output",
                "call_id": item.call_id,
                "output": result,
            })

    if not tool_outputs:
        break

    response = client.responses.create(
        model=MODEL,
        input=tool_outputs,
        previous_response_id=response.id,
        tools=tools,
    )
```

## Open questions

| Question | Options |
|----------|---------|
| Which level should this be? | New exercise on top of Level 1, or a dedicated Level 4? |
| Should we also show `web_search_preview`? | Built-in hosted tool, zero code — good contrast to custom functions |
| Multiple tools? | Could add a second tool (e.g. unit converter, calculator) to show multi-tool routing |
| TypeScript version? | Port to TypeScript for parity with other levels |

## Reference

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- Spike branch: `test/tool-calling`
