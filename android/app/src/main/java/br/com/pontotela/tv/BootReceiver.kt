package br.com.pontotela.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** TV ligou na tomada (reboot completo): abre o player e liga o vigia do standby. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        WakeService.start(context)
        WakeService.openPlayer(context)
    }
}
