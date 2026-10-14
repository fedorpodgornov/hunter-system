var CONFIG = {
  supabaseUrl: 'https://dhllkljjdantrovchuym.supabase.co',
  supabaseAnonKey: 'sb_publishable_68JOcJ5CxsoD0UHY1LJuSw_spsc9KGo'
};

function sbConfigured() {
  return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}
