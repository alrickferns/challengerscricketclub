/* ============================================================
   SUPABASE CONFIGURATION
   ============================================================ */

const supabaseConfig = {
    url: "https://mecrebowrerriougjcia.supabase.co",
    anonKey: "sb_publishable_YjqK46losPq7fcSY4-kIEQ_gLqDDTZo"
};

/**
 * Checks if real Supabase keys have been configured.
 * If false, the app automatically runs on local storage so it never breaks.
 */
function isSupabaseConfigured() {
    return Boolean(
        supabaseConfig &&
        supabaseConfig.url &&
        supabaseConfig.anonKey &&
        supabaseConfig.url.startsWith("https://") &&
        supabaseConfig.anonKey !== "YOUR_SUPABASE_ANON_KEY"
    );
}

window.supabaseConfig = supabaseConfig;
window.isSupabaseConfigured = isSupabaseConfigured;
