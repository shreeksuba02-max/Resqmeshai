# RescueMesh AI — Testing & Verification Plan

## 1. Automated & Live API Tests
- **AI Model Evaluation:** `python3 RescueMeshAI/ai-engine/training/train_pure_rf.py` trains 40 CART bootstrap trees on 1,918 training records and evaluates on 482 stratified held-out test records (`Accuracy: 0.8444`, `Macro F1: 0.7884`).
- **Offline Sync Idempotency:** Submitting duplicate `messageId` payloads to `POST /api/emergency/sync` returns `status: "DUPLICATE"` without creating duplicate database rows.
- **RBAC Enforcement:** Calling `POST /api/dispatch/assign` or `PATCH /api/emergency/:id/status` without a `RESCUE_TEAM` JWT token returns HTTP `401` / `403`.

## 2. Field & Simulation Tests
- **Offline Mode Queueing:** Toggle "Simulate Internet Blackout" in the Field Device workspace, trigger an SOS, verify local persistence, restore internet, and verify automatic sync via `POST /api/emergency/sync` and real-time appearance on the Leaflet Victim Map.
- **Mesh Store-Carry-Forward Lab:** Test Priority Preemption (`SOS` ahead of `CHAT`), TTL=1 expiration drop, and duplicate replay rejection in Simulation Mode.
- **Physical Android Multi-Device Validation:** Build `RescueMeshAI/android-app/` onto 3 physical Android 10+ devices to test live BLE GATT characteristic writes and Wi-Fi Direct group owner transfers with Airplane Mode + Bluetooth/Wi-Fi enabled.
