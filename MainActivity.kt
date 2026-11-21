package org.rescuemesh.ai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import org.rescuemesh.ai.sensors.ShakeDetector
import org.rescuemesh.ai.ui.MainViewModel
import org.rescuemesh.ai.ui.screens.RescueMeshAppNav
import org.rescuemesh.ai.ui.theme.RescueMeshTheme

class MainActivity : ComponentActivity() {
    private var shakeDetector: ShakeDetector? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RescueMeshTheme {
                val vm: MainViewModel = viewModel()
                shakeDetector = ShakeDetector(this) {
                    vm.triggerShakeConfirmation()
                }.also { it.start() }

                RescueMeshAppNav(viewModel = vm)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        shakeDetector?.stop()
    }
}
