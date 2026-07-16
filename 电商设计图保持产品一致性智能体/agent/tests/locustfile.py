"""Locust load test for the ShopMate AI product image agent.

Usage:
    locust -f agent/tests/locustfile.py --host=http://localhost:8080

Or headless:
    locust -f agent/tests/locustfile.py --host=http://localhost:8080 \
        --headless -u 5 -r 1 --run-time 60s --csv=results/agent-report
"""

import os
import uuid
import json
from locust import HttpUser, task, between, events

# A small valid 1x1 pixel JPEG as base64 for image tasks
TINY_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRFJiM0RGYiUGRoSGSI1JDUkKSE//aAAwDAQACEQMRAD8A3+/Sgw9AAAMpSURBVEhJ/YINDd4A/9k="

# A simple test product name
TEST_PRODUCT = "Portable Blender 500ml"

class AgentUser(HttpUser):
    """Simulates a platform backend calling the agent API."""
    
    wait_time = between(2, 5)
    
    def on_start(self):
        """Read or create an API key for authentication."""
        self.api_key = os.environ.get("AGENT_API_KEY", "test-key")
        self.headers = {"X-Api-Key": self.api_key, "Content-Type": "application/json"}
    
    @task(3)
    def health_check(self):
        """Health endpoint — lightweight, frequent."""
        self.client.get("/api/v1/agent/health", headers=self.headers)
    
    @task(1)
    def create_and_poll_text_task(self):
        """Create a research task and poll until completion."""
        task_type = "product_research"
        payload = {
            "taskType": task_type,
            "input": {
                "productName": TEST_PRODUCT,
                "marketplace": "amazon.com"
            },
            "context": {"orgId": "loadtest", "requestId": str(uuid.uuid4())}
        }
        
        with self.client.post(
            "/api/v1/agent/runs",
            json=payload,
            headers=self.headers,
            catch_response=True,
            name="create_text_task"
        ) as resp:
            if resp.status_code != 202:
                resp.failure(f"Expected 202, got {resp.status_code}")
                return
            data = resp.json()
            run_id = data.get("runId")
        
        if not run_id:
            return
        
        # Poll up to 30 seconds
        import time
        deadline = time.time() + 30
        while time.time() < deadline:
            with self.client.get(
                f"/api/v1/agent/runs/{run_id}",
                headers=self.headers,
                catch_response=True,
                name="poll_text_task"
            ) as poll_resp:
                if poll_resp.status_code != 200:
                    poll_resp.failure(f"Poll failed: {poll_resp.status_code}")
                    return
                status = poll_resp.json().get("status")
                if status == "completed":
                    return  # success
                if status == "failed":
                    poll_resp.failure("Task failed")
                    return
            time.sleep(2)
    
    @task(1)
    def create_and_poll_image_task(self):
        """Create an image generation task and poll."""
        payload = {
            "taskType": "generate_images",
            "input": {
                "productName": TEST_PRODUCT,
                "imageBase64": TINY_JPEG_BASE64,
                "sceneCount": 3
            },
            "context": {"orgId": "loadtest", "requestId": str(uuid.uuid4())}
        }
        
        with self.client.post(
            "/api/v1/agent/runs",
            json=payload,
            headers=self.headers,
            catch_response=True,
            name="create_image_task"
        ) as resp:
            if resp.status_code != 202:
                resp.failure(f"Expected 202, got {resp.status_code}")
                return
            data = resp.json()
            run_id = data.get("runId")
        
        if not run_id:
            return
        
        # Poll up to 120 seconds
        import time
        deadline = time.time() + 120
        while time.time() < deadline:
            with self.client.get(
                f"/api/v1/agent/runs/{run_id}",
                headers=self.headers,
                catch_response=True,
                name="poll_image_task"
            ) as poll_resp:
                if poll_resp.status_code != 200:
                    return
                status = poll_resp.json().get("status")
                if status in ("completed", "failed"):
                    return
            time.sleep(3)
