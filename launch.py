import subprocess
import os
import platform
import webbrowser
import time

def run_backend():
    backend_path = os.path.join(os.getcwd(), 'backend', 'app.js')
    print(f"🚀 Starting backend: {backend_path}")

    try:
        return subprocess.Popen(['node', backend_path], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    except FileNotFoundError:
        print("❌ Node.js not found. Make sure Node is installed and available in your PATH.")
        return None

def run_frontend():
    frontend_path = os.path.join(os.getcwd(), 'frontend', 'index.html')
    if os.path.exists(frontend_path):
        print("🌐 Opening frontend in browser...")
        webbrowser.open('file://' + frontend_path)
    else:
        print("❌ index.html not found at:", frontend_path)

if __name__ == "__main__":
    backend_process = run_backend()
    time.sleep(2)  # Give backend time to start
    run_frontend()

    if backend_process:
        print("🔁 Backend output:")
        try:
            for line in backend_process.stdout:
                print(line.decode(), end="")
        except KeyboardInterrupt:
            print("\n🛑 Shutting down backend...")
            backend_process.terminate()