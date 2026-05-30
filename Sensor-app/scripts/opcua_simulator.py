from opcua import Server
import random
import time
from datetime import datetime

def create_simulated_server():
    # Initialize Server
    server = Server()
    
    # Server setup
    endpoint = "opc.tcp://0.0.0.0:4840"
    server.set_endpoint(endpoint)

    # Setup namespace
    uri = "http://example.org/simulation"
    idx = server.register_namespace(uri)

    # Get Objects node
    objects = server.get_objects_node()

    # Create a simulation object
    sim_object = objects.add_object(idx, "SimulationDevice")

    # Create variables
    temp = sim_object.add_variable(idx, "Temperature", 0.0)
    humidity = sim_object.add_variable(idx, "Humidity", 0.0)
    pressure = sim_object.add_variable(idx, "Pressure", 0.0)

    # Set variables as writable
    temp.set_writable()
    humidity.set_writable()
    pressure.set_writable()

    print(f"Server is running at {endpoint}")
    print(f"Namespace is {uri}")
    print("\nAvailable Nodes:")
    print(f"Temperature Node: ns={idx};i={temp.nodeid.Identifier}")
    print(f"Humidity Node: ns={idx};i={humidity.nodeid.Identifier}")
    print(f"Pressure Node: ns={idx};i={pressure.nodeid.Identifier}")

    # Start the server
    server.start()

    try:
        while True:
            # Update variables with random values
            temp.set_value(round(random.uniform(20.0, 30.0), 2))      # Temperature between 20-30°C
            humidity.set_value(round(random.uniform(30.0, 70.0), 2))  # Humidity between 30-70%
            pressure.set_value(round(random.uniform(980, 1020), 2))   # Pressure between 980-1020 hPa
            
            # Print current values
            print(f"\r{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - "
                  f"Temp: {temp.get_value():.2f}°C, "
                  f"Humidity: {humidity.get_value():.2f}%, "
                  f"Pressure: {pressure.get_value():.2f}hPa", end='')
            
            time.sleep(1)  # Update every second

    except KeyboardInterrupt:
        print("\nStopping server...")
        server.stop()

if __name__ == "__main__":
    create_simulated_server()