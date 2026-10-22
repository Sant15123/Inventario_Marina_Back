import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://maaggiefwtdtwhzmazau.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseServiceRoleKey && process.env.NODE_ENV !== 'test') {
  console.warn('⚠️ AVISO: SUPABASE_SERVICE_ROLE_KEY no está configurada en las variables de entorno.');
}

const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || supabaseServiceRoleKey || '';

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || 'placeholder-service-role-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || supabaseServiceRoleKey || 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default supabaseAdmin;
