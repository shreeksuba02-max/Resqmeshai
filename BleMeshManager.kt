package org.rescuemesh.ai.mesh

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.UUID

data class NearbyBlePeer(
    val address: String,
    val name: String,
    val rssi: Int,
    val lastSeenMs: Long
)

class BleMeshManager(
    private val context: Context,
    private val onPacketReceived: (String) -> Unit
) {
    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("0000FE9F-0000-1000-8000-00805F9B34FB")
        val CHAR_PACKET_UUID: UUID = UUID.fromString("0000FE9E-0000-1000-8000-00805F9B34FB")
    }

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager?.adapter
    private var gattServer: BluetoothGattServer? = null

    private val _peers = MutableStateFlow<List<NearbyBlePeer>>(emptyList())
    val peers: StateFlow<List<NearbyBlePeer>> = _peers

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device ?: return
            val updated = _peers.value.filterNot { it.address == device.address } + NearbyBlePeer(
                address = device.address,
                name = device.name ?: "RescueMesh-Node",
                rssi = result.rssi,
                lastSeenMs = System.currentTimeMillis()
            )
            _peers.value = updated.sortedByDescending { it.rssi }
        }
    }

    @SuppressLint("MissingPermission")
    fun startDiscoveryAndGattServer() {
        if (adapter == null || !adapter.isEnabled) return

        gattServer = bluetoothManager?.openGattServer(context, object : BluetoothGattServerCallback() {
            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice,
                requestId: Int,
                characteristic: BluetoothGattCharacteristic,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray
            ) {
                if (characteristic.uuid == CHAR_PACKET_UUID) {
                    onPacketReceived(String(value, Charsets.UTF_8))
                }
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            }
        })

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val charPacket = BluetoothGattCharacteristic(
            CHAR_PACKET_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
        )
        service.addCharacteristic(charPacket)
        gattServer?.addService(service)

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
            .setConnectable(true)
            .build()
        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        adapter.bluetoothLeAdvertiser?.startAdvertising(settings, data, object : AdvertiseCallback() {})

        val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build())
        val scanSettings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build()
        adapter.bluetoothLeScanner?.startScan(filters, scanSettings, scanCallback)
    }

    @SuppressLint("MissingPermission")
    fun sendPacketToPeer(peerAddress: String, payloadJson: String) {
        val device = adapter?.getRemoteDevice(peerAddress) ?: return
        device.connectGatt(context, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    gatt.close()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val ch = gatt.getService(SERVICE_UUID)?.getCharacteristic(CHAR_PACKET_UUID)
                if (ch != null) {
                    ch.value = payloadJson.toByteArray(Charsets.UTF_8)
                    gatt.writeCharacteristic(ch)
                } else {
                    gatt.disconnect()
                }
            }
        })
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        gattServer?.close()
    }
}
