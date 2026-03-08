# PRD: Add Tool Calling (Function Calling)

## Background

AI models can do more than generate text — they can **call functions** you define. This lets the model reach out to external APIs, databases, or any code you write to get real data before responding.

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

## Requirements

Add a `get_weather` tool to the terminal chatbot that fetches real weather data from Open-Meteo (free, no API key needed).

### What you'll learn

1. Defining a tool schema (JSON Schema for parameters)
2. Passing `tools=` to `responses.create()`
3. Detecting `function_call` items in the response output
4. Executing the function and returning results via `function_call_output`
5. The tool-calling loop pattern (model may call multiple tools or chain calls)

## Step-by-Step: Python (`level-1-chat/python/chat.py`)

There are 3 changes to make. Each one tells you exactly where to paste the code.

---

### Change 1: Add `import json` at the top

Find this line near the top of the file (~line 20):

```python
import os
```

Add `json` right above it:

```python
import json
import os
```

---

### Change 2: Add the tool definition, function, and mapping

Paste this block **after** the client is created (~after line 62, right before the welcome banner):

```python
# --- Tool Calling Setup ---
# Define the tools the model can call. Each tool has a name, description,
# and a JSON Schema describing its parameters. The model uses these to
# decide when to call the tool and what arguments to pass.
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


def get_weather(location):
    """Fetch real weather data from Open-Meteo (free, no API key needed).
    httpx is already installed as an openai dependency."""
    import httpx

    # Strip everything after the comma — Open-Meteo's geocoder fails on
    # "Raleigh, NC" but works on "Raleigh". The model tends to pass
    # "City, State" format since we describe the parameter that way.
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


# Map tool names to functions so we can look them up when the model calls one.
tool_mapping = {
    "get_weather": get_weather,
}
```

---

### Change 3: Add `tools=tools` and the tool-calling loop

Find the `responses.create()` call and the response printing (~lines 112-130). Replace this entire block:

```python
    # 6d. Send the message to the API
    try:
        response = client.responses.create(
            model=MODEL,                              # Which model to use
            input=user_input,                         # The user's message
            instructions=INSTRUCTIONS,                # System-level instructions
            reasoning={"effort": REASONING_EFFORT},   # How hard the model thinks
            previous_response_id=previous_response_id,  # Conversation continuity
        )

        # 6e. Print the response and save the ID for next turn
        print(f"\nAssistant: {response.output_text}")

        # 6f. Show token usage so you can track context consumption
        # The API returns usage stats on every response: how many tokens
        # were used for input (your messages + history) and output (the reply).
        if response.usage:
            print(f"  [tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out, {response.usage.total_tokens} total]")
        print()

        previous_response_id = response.id
```

With this:

```python
    # 6d. Send the message to the API (now with tools!)
    try:
        response = client.responses.create(
            model=MODEL,                              # Which model to use
            input=user_input,                         # The user's message
            instructions=INSTRUCTIONS,                # System-level instructions
            reasoning={"effort": REASONING_EFFORT},   # How hard the model thinks
            previous_response_id=previous_response_id,  # Conversation continuity
            tools=tools,                              # Tell the model about our tools
        )

        # 6e. Tool-calling loop
        # The model might respond with a function_call instead of text.
        # When that happens, we run the function and send the result back.
        # The model may call tools multiple times before giving a final answer.
        while True:
            tool_outputs = []
            for item in response.output:
                if item.type == "function_call":
                    args = json.loads(item.arguments)
                    func = tool_mapping.get(item.name)
                    result = func(**args) if func else json.dumps({"error": f"Unknown tool: {item.name}"})
                    tool_outputs.append({
                        "type": "function_call_output",
                        "call_id": item.call_id,
                        "output": result,
                    })

            if not tool_outputs:
                break  # No tool calls — the model gave a text response

            # Send the tool results back so the model can use them
            response = client.responses.create(
                model=MODEL,
                input=tool_outputs,
                previous_response_id=response.id,
                tools=tools,
            )

        # 6f. Print the final response and save the ID for next turn
        print(f"\nAssistant: {response.output_text}")

        # 6g. Show token usage so you can track context consumption
        if response.usage:
            print(f"  [tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out, {response.usage.total_tokens} total]")
        print()

        previous_response_id = response.id
```

> **Note:** The `except` block and the rest of the loop stay exactly the same.

---

## Step-by-Step: TypeScript (`level-1-chat/typescript/chat.ts`)

Same 3 changes, adapted for TypeScript.

---

### Change 1: No new imports needed

TypeScript's OpenAI SDK includes everything. No changes to the import section.

---

### Change 2: Add the tool definition, function, and mapping

Paste this block **after** the client is created (~after line 59, right before the welcome banner):

```typescript
// --- Tool Calling Setup ---
const tools: OpenAI.Responses.Tool[] = [
    {
        type: "function",
        name: "get_weather",
        description: "Get the current weather for a given location.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City name, e.g. 'Durham, NC'",
                },
            },
            required: ["location"],
            additionalProperties: false,
        },
        strict: true,
    },
];

async function getWeather(location: string): Promise<string> {
    // Strip everything after the comma — Open-Meteo's geocoder fails on
    // "Raleigh, NC" but works on "Raleigh".
    const cityName = location.split(",")[0].trim();
    const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`
    );
    const geo = await geoRes.json();

    if (!geo.results?.length) {
        return JSON.stringify({ error: `Could not find location: ${location}` });
    }

    const place = geo.results[0];
    const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`
    );
    const weather = await weatherRes.json();
    const current = weather.current;

    return JSON.stringify({
        location: place.name ?? location,
        temperature: `${current.temperature_2m}°F`,
        humidity: `${current.relative_humidity_2m}%`,
        wind_speed: `${current.wind_speed_10m} mph`,
    });
}

const toolMapping: Record<string, (args: any) => Promise<string>> = {
    get_weather: (args) => getWeather(args.location),
};
```

---

### Change 3: Add `tools` and the tool-calling loop

Find the `responses.create()` call and response printing (~lines 118-135). Replace this block:

```typescript
            const response = await client.responses.create({
                model: MODEL,                                     // Which model to use
                input: userInput,                                 // The user's message
                instructions: INSTRUCTIONS,                       // System-level instructions
                reasoning: { effort: REASONING_EFFORT as "low" | "medium" | "high" },
                previous_response_id: previousResponseId ?? undefined,  // Conversation continuity
            });

            // 6d. Print the response and save the ID for next turn
            console.log(`\nAssistant: ${response.output_text}`);

            // 6e. Show token usage so you can track context consumption
            if (response.usage) {
                console.log(`  [tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out, ${response.usage.total_tokens} total]`);
            }
            console.log();

            previousResponseId = response.id;
```

With this:

```typescript
            let response = await client.responses.create({
                model: MODEL,
                input: userInput,
                instructions: INSTRUCTIONS,
                reasoning: { effort: REASONING_EFFORT as "low" | "medium" | "high" },
                previous_response_id: previousResponseId ?? undefined,
                tools,
            });

            // 6d. Tool-calling loop
            while (true) {
                const toolOutputs: any[] = [];
                for (const item of response.output) {
                    if (item.type === "function_call") {
                        const func = toolMapping[item.name];
                        const result = func
                            ? await func(JSON.parse(item.arguments))
                            : JSON.stringify({ error: `Unknown tool: ${item.name}` });
                        toolOutputs.push({
                            type: "function_call_output",
                            call_id: item.call_id,
                            output: result,
                        });
                    }
                }

                if (toolOutputs.length === 0) break;

                response = await client.responses.create({
                    model: MODEL,
                    input: toolOutputs,
                    previous_response_id: response.id,
                    tools,
                });
            }

            // 6e. Print the final response and save the ID for next turn
            console.log(`\nAssistant: ${response.output_text}`);

            // 6f. Show token usage
            if (response.usage) {
                console.log(`  [tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out, ${response.usage.total_tokens} total]`);
            }
            console.log();

            previousResponseId = response.id;
```

> **Note:** Change `const response` to `let response` since we reassign it in the loop.

---

## Verification

1. Run the chatbot and ask: **"What's the weather in Durham?"**
2. Confirm the response includes real weather data (temperature, humidity, wind speed)
3. Try **"What's the weather in Raleigh, NC?"** to verify the comma-stripping fix works
4. Ask a normal question like **"What is Python?"** to confirm it still works without calling tools
5. Try **"Compare the weather in Durham and San Francisco"** to see if the model chains multiple tool calls
