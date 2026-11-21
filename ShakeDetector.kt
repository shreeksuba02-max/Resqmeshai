package org.rescuemesh.ai.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Detects 3 intentional phone shakes within a configurable time window
 * while filtering accidental motion via acceleration threshold.
 * Note: Lock-screen and OS-level SOS triggers require privileged system
 * permissions and are documented as future enhancements.
 */
class ShakeDetector(
    context: Context,
    private val onTripleShakeDetected: () -> Unit
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    var shakeThresholdG: Float = 2.2f
    var requiredShakes: Int = 3
    var timeWindowMs: Long = 2500L
    private val minIntervalBetweenShakesMs: Long = 350L

    private val shakeTimestamps = ArrayDeque<Long>()
    private var lastShakeMs = 0L

    fun start() {
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val gX = event.values[0] / SensorManager.GRAVITY_EARTH
        val gY = event.values[1] / SensorManager.GRAVITY_EARTH
        val gZ = event.values[2] / SensorManager.GRAVITY_EARTH
        val gForce = sqrt(gX * gX + gY * gY + gZ * gZ)

        if (gForce >= shakeThresholdG) {
            val now = System.currentTimeMillis()
            if (now - lastShakeMs < minIntervalBetweenShakesMs) return
            lastShakeMs = now

            shakeTimestamps.addLast(now)
            while (shakeTimestamps.isNotEmpty() && now - shakeTimestamps.first() > timeWindowMs) {
                shakeTimestamps.removeFirst()
            }

            if (shakeTimestamps.size >= requiredShakes) {
                shakeTimestamps.clear()
                onTripleShakeDetected()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
