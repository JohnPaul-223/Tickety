// Supabase Configuration
// Wait for Supabase library to be available
(function initializeSupabase() {
    'use strict';
    
    console.log('🔧 Initializing Supabase configuration...');
    console.log('📦 window.supabase available:', typeof window.supabase);

    // Check if Supabase library is loaded
    if (typeof window.supabase === 'undefined') {
        console.error('❌ Supabase library not loaded!');
        console.error('💡 The @supabase/supabase-js library must be loaded first');
        console.error('🌐 Check your internet connection');
        alert('Error: Supabase library not loaded. Please check your internet connection and reload.');
        return;
    }

    const SUPABASE_URL = 'https://vvdhzzrpuwppsxqioeat.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_riVW4Au_E9MwnFbAaqwPUA_Oq-wbQ6Y'; // Replace this with your actual anon/public key from Supabase settings

    // Create Supabase client and make it globally available
    try {
        window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        console.log('✅ Supabase client created successfully');
        console.log('📡 Project URL:', SUPABASE_URL);
        console.log('🔗 Client type:', typeof window.supabase);
        console.log('🔗 .from() available:', typeof window.supabase.from);
        
        // Test connection
        window.supabase
            .from('tickets')
            .select('count')
            .then(({ data, error }) => {
                if (error) {
                    console.error('❌ Database connection error:', error.message);
                    
                    if (error.message.includes('relation') || error.message.includes('does not exist')) {
                        alert('⚠️ Database tables not found!\n\nPlease run the supabase-setup.sql script in your Supabase SQL Editor.\n\nCheck SUPABASE_SETUP_GUIDE.md for instructions.');
                    }
                } else {
                    console.log('✅ Database connection successful!');
                    console.log('🎉 Ticketing system ready!');
                }
            });
            
        // Clear old localStorage data
        if (localStorage.getItem('tickets') || localStorage.getItem('schedule')) {
            console.log('🧹 Clearing old localStorage data...');
            localStorage.removeItem('tickets');
            localStorage.removeItem('schedule');
        }
        
    } catch (error) {
        console.error('❌ Failed to create Supabase client:', error);
        alert('Error initializing Supabase: ' + error.message);
    }
})();
