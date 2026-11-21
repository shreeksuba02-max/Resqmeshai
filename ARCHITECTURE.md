# RescueMesh AI — System Architecture (SIH26206)

**Tagline:** OFFLINE. CONNECTED. ALIVE.

## 1. Store → Carry → Forward Model
When cellular towers and internet links fail during floods, cyclones, or earthquakes, RescueMesh AI switches to delay-tolerant device-to-device (DTN) communication:
1. **Store:** Emergency SOS packets are encrypted (`AES-256-GCM`), assigned a UUID `messageId`, and persisted immediately in Room SQLite (`EmergencyEntity` + `MeshMessageEntity`).
2. **Carry:** Devices act as mobile relays (`RELAY_NODE` or `SURVIVOR`). Packets remain cached locally until TTL expiration or confirmed server synchronization.
3. **Forward:**
   - **Priority 1 (SOS) & Priority 2 (Medical):** Epidemic routing floods all encountered peers over Bluetooth Low Energy GATT (`BleMeshManager.kt`) and Wi-Fi Direct TCP (`WifiDirectManager.kt`).
   - **Priority 3 (Location) & Priority 4 (Chat):** PRoPHET probabilistic routing forwards only to peers with delivery predictability >= 0.45.
   - **Loop Prevention:** Every node checks `messageDao.exists(messageId)` and decrements `ttl` on each hop.

## 2. Honest Delivery State Machine
RescueMesh AI never claims an SOS reached the Rescue Team until an actual backend ACK is received:
`SOS_CREATED` → `STORED_LOCALLY` → `NEARBY_DEVICE_RECEIVED` → `FORWARDED` → `RESCUE_TEAM_RECEIVED` → `HELP_ASSIGNED` → `IN_PROGRESS` → `RESOLVED`

## 3. Hardware & OS Limitations
- **Web Sandbox vs Physical Android Hardware:** Web browsers cannot run background BLE GATT peripheral servers or Wi-Fi Direct P2P groups. Therefore, the web Mesh Simulator operates in an explicitly labeled **Simulation Mode** for demonstration, while physical device-to-device radio transport is implemented in `RescueMeshAI/android-app/`.
- **Shake-to-SOS Lock-Screen Integration:** Triggering SOS from a locked Android screen or overriding OS power-button gestures requires privileged system/OEM permissions and is documented as a future enhancement.
