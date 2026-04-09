import sys
import time
from ib_insync import IB

print(f"Python: {sys.version}", flush=True)

try:
    ib = IB()
    print("Created IB instance.", flush=True)
    
    print("Connecting...", flush=True)
    ib.connect('127.0.0.1', 8000, clientId=998) # Wait, port 7497 is default for TWS paper? User said 7497 in prompt?
    # User prompt said "Asegurate de que TWS... este abierto... puerto 7497".
    # I used 8000 in previous step by mistake? No, I used 7497.
    # Wait, check previous code content.
    # I used 7497 in step 922.
    # I will use 7497 here.
    
    ib.disconnect() # Reset any previous state
    time.sleep(1)
    
    ib.connect('127.0.0.1', 7497, clientId=998)
    print("Connected successfully!", flush=True)
    
    print("Requesting positions...", flush=True)
    positions = ib.positions()
    print(f"Positions count: {len(positions)}", flush=True)
    
    ib.disconnect()
    print("Disconnected.", flush=True)

except Exception as e:
    print(f"Error: {e}", flush=True)
