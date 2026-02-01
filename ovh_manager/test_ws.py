import websocket
import ssl
import json

# Test WebSocket connection to exoskull.xyz
try:
    print("Testing WebSocket to wss://exoskull.xyz...")
    ws = websocket.create_connection(
        "wss://exoskull.xyz",
        sslopt={"cert_reqs": ssl.CERT_NONE},
        timeout=10
    )
    print("Connected!")
    
    # Try to send a ping or health check
    ws.send(json.dumps({"action": "health"}))
    result = ws.recv()
    print(f"Response: {result}")
    ws.close()
    
except Exception as e:
    print(f"Error: {e}")
    print()
    print("Trying ws://exoskull.xyz:8080...")
    try:
        ws = websocket.create_connection(
            "ws://exoskull.xyz:8080",
            timeout=10
        )
        print("Connected to port 8080!")
        ws.close()
    except Exception as e2:
        print(f"Error: {e2}")
