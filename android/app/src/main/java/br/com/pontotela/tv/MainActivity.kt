package br.com.pontotela.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Casca do player: pede o codigo da tela uma vez (assets/setup.html) e depois so abre
 * https://pontotela.com.br/<codigo> numa WebView em tela cheia.
 * Toda a logica (programacao, cache offline, recarregar) continua no public/tv/player.js.
 *
 * Botao VOLTAR do controle no player: volta pra tela do codigo (pra trocar de tela).
 */
class MainActivity : Activity() {
    private val prefs by lazy { getSharedPreferences("pontotela", MODE_PRIVATE) }
    private val handler = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    private var playing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WakeService.start(this)
        val code = prefs.getString(KEY_CODE, null)
        if (code == null) showCodeForm() else showPlayer(code)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Suppress("DEPRECATION") // flags antigas funcionam do Android 5 ao atual
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    // ---------- tela do codigo ----------
    /** Unica ponte JS -> app. So existe na WebView da tela local, nunca na do player remoto. */
    inner class SetupBridge {
        @JavascriptInterface
        fun save(code: String) {
            // Mesmo formato que o servidor aceita na rota /:code (so digitos).
            if (!CODE_RE.matches(code)) return
            runOnUiThread {
                prefs.edit().putString(KEY_CODE, code).apply()
                showPlayer(code)
            }
        }

        /** Saida pras configuracoes da TV quando o app e a tela inicial (HOME cai aqui). */
        @JavascriptInterface
        fun openTvSettings() {
            runOnUiThread { startActivity(Intent(Settings.ACTION_SETTINGS)) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun showCodeForm() {
        val wv = newWebView()
        wv.addJavascriptInterface(SetupBridge(), "PontoTela")
        playing = false
        val saved = Uri.encode(prefs.getString(KEY_CODE, "") ?: "")
        wv.loadUrl("file:///android_asset/setup.html?code=$saved")
        wv.requestFocus()
    }

    // ---------- player ----------
    private fun showPlayer(code: String) {
        val url = "$BASE_URL/$code"
        val wv = newWebView()
        playing = true
        wv.isFocusable = false // o controle nao tem o que fazer dentro do player
        wv.settings.mediaPlaybackRequiresUserGesture = false
        wv.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                // Sem internet ao ligar a TV: a pagina nem carrega. Tenta de novo depois.
                // ponytail: retry fixo de 15s; sem copia offline da pagina do player em si.
                if (req.isForMainFrame) {
                    view.loadData(OFFLINE_HTML, "text/html; charset=utf-8", "utf-8")
                    handler.removeCallbacksAndMessages(null)
                    handler.postDelayed({ view.loadUrl(url) }, RETRY_MS)
                }
            }
        }
        wv.loadUrl(url)
        askOverlayOnce()
    }

    /**
     * Sem "Sobrepor a outros apps" o Android 10+ bloqueia o WakeService de reabrir o player
     * quando a TV sai do standby. Pede uma vez so: se a pessoa negar, nao fica insistindo
     * a cada abertura. Liberar depois por adb:
     *   adb shell appops set br.com.pontotela.tv SYSTEM_ALERT_WINDOW allow
     */
    private fun askOverlayOnce() {
        if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)) return
        if (prefs.getBoolean(KEY_ASKED_OVERLAY, false)) return
        prefs.edit().putBoolean(KEY_ASKED_OVERLAY, true).apply()
        Toast.makeText(
            this,
            "Ative \"Ponto Tela\" na próxima tela para o app abrir sozinho quando a TV ligar",
            Toast.LENGTH_LONG
        ).show()
        val pkg = Uri.parse("package:$packageName")
        // Algumas TVs nao tem a tela de sobreposicao; cai nos detalhes do app.
        for (action in listOf(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Settings.ACTION_APPLICATION_DETAILS_SETTINGS)) {
            try {
                startActivity(Intent(action, pkg))
                return
            } catch (_: ActivityNotFoundException) {
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun newWebView(): WebView {
        destroyWebView()
        return WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            // Sem isto a WebView desenha o "botao de play" cinza padrao antes do 1o frame.
            webChromeClient = object : WebChromeClient() {
                override fun getDefaultVideoPoster(): Bitmap =
                    Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // player guarda a programacao no localStorage pra tocar offline
            webView = this
            setContentView(this)
        }
    }

    private fun destroyWebView() {
        handler.removeCallbacksAndMessages(null)
        webView?.destroy()
        webView = null
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && playing) {
            showCodeForm()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        destroyWebView()
        super.onDestroy()
    }

    companion object {
        private const val BASE_URL = "https://pontotela.com.br"
        private const val KEY_CODE = "screenCode"
        private const val KEY_ASKED_OVERLAY = "askedOverlay"
        private const val RETRY_MS = 15_000L
        private val CODE_RE = Regex("\\d{1,9}")
        private const val OFFLINE_HTML =
            "<body style='background:#101511;color:#a9b6ab;font:24px sans-serif;display:flex;" +
                "align-items:center;justify-content:center;height:100vh;margin:0'>" +
                "Sem conexão. Tentando de novo…</body>"
    }
}
