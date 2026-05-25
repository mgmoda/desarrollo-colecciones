import { createClient } from '@supabase/supabase-js'

// Proyecto Supabase propio de "Desarrollo de Colecciones" (independiente de MG).
// La "publishable key" es pública por diseño (segura en el navegador);
// el acceso real lo controlan las políticas RLS + el login.
const SUPABASE_URL = 'https://queucqfinihprgaxrhux.supabase.co'
const SUPABASE_KEY = 'sb_publishable_sgyqPYvJe-FpAkZiG6Qfnw_VXBwfbi_'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
