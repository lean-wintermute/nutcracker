/**
 * Nutcracker Bear Ranker - Service Worker
 *
 * Provides offline functionality for the PWA.
 * - Cache-first strategy for static assets (HTML, images)
 * - Network-first for potential future API calls (Firebase)
 * - Automatic cache cleanup on version update
 */

'use strict';

// Cache version - increment to invalidate old caches
const CACHE_VERSION = 'v21';
const CACHE_NAME = `nutcracker-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Image files to cache (237 images - updated 2025-12-22)
const IMAGE_FILES = [
  '01_child_shares.png',
  '01_folding_together.png',
  '01_laundromat.png',
  '01_lighthouse_keeper.png',
  '01_rooftop_dawn.png',
  '01_sharing_bench.png',
  '01_train_platform.png',
  '01_window_looking_in.png',
  '02_apartment_landing.png',
  '02_busker_duet.png',
  '02_cafe_window.png',
  '02_empty_theater.png',
  '02_lost_sock_search.png',
  '02_night_bus.png',
  '02_platform_vendor.png',
  '02_seagull_friend.png',
  '03_bookshop_reader.png',
  '03_ferry_deck.png',
  '03_hospital_corridor.png',
  '03_kitchen_table.png',
  '03_lost_child_found.png',
  '03_phone_booth.png',
  '03_seasick_comfort.png',
  '03_sleeping_child.png',
  '04_deck_hands_break.png',
  '04_porter_assistance.png',
  '04_stray_cat_company.png',
  '05_teaching_quarters.png',
  '05_train_window_wave.png',
  '05_violin_on_water.png',
  '06_closing_time.png',
  '06_docking_goodbye.png',
  '06_midnight_arrival.png',
  'alive_01_invisible_among_crowd_01_busy_street_082316.png',
  'alive_02_awkward_interactions_01_bartender_stare_082316.png',
  'alive_03_one_kind_soul_01_child_waves_082316.png',
  'alive_04_complete_solitude_01_empty_playground_082316.png',
  'animated_01_invisible_crowd_01_shopping_street_082316.png',
  'animated_04_total_solitude_01_diner_3am_082316.png',
  'bear_cgi_park_bench.png',
  'bear_cgi_rooftop_dawn.png',
  'bear_claymation_cafe_window.png',
  'bear_claymation_rooftop_dawn.png',
  'bear_claymation_train_platform.png',
  'bear_handdrawn_cafe_window.png',
  'bear_handdrawn_park_bench.png',
  'bear_handdrawn_train_platform.png',
  'bear_puppet_cafe_window.png',
  'bear_puppet_park_bench.png',
  'bear_puppet_rooftop_dawn.png',
  'bear_puppet_train_platform.png',
  'bear_stopmotion_cafe_window.png',
  'bear_stopmotion_park_bench.png',
  'bear_stopmotion_rooftop_dawn.png',
  'bear_stopmotion_train_platform.png',
  'hippo_cgi_bus_stop.png',
  'hippo_cgi_diner_booth.png',
  'hippo_cgi_laundromat.png',
  'hippo_cgi_phone_booth.png',
  'hippo_cgi_subway_car.png',
  'hippo_claymation_bus_stop.png',
  'hippo_claymation_diner_booth.png',
  'hippo_claymation_laundromat.png',
  'hippo_claymation_phone_booth.png',
  'hippo_claymation_subway_car.png',
  'hippo_handdrawn_bus_stop.png',
  'hippo_handdrawn_diner_booth.png',
  'hippo_handdrawn_laundromat.png',
  'hippo_handdrawn_phone_booth.png',
  'hippo_handdrawn_subway_car.png',
  'hippo_puppet_bus_stop.png',
  'hippo_puppet_diner_booth.png',
  'hippo_puppet_laundromat.png',
  'hippo_puppet_phone_booth.png',
  'hippo_puppet_subway_car.png',
  'hippo_stopmotion_bus_stop.png',
  'hippo_stopmotion_diner_booth.png',
  'hippo_stopmotion_laundromat.png',
  'hippo_stopmotion_phone_booth.png',
  'hippo_stopmotion_subway_car.png',
  'lion_cgi_bookshop.png',
  'lion_cgi_cafe_window.png',
  'lion_cgi_hotel_lobby.png',
  'lion_cgi_park_bench.png',
  'lion_cgi_rooftop_dawn.png',
  'lion_cgi_street_corner.png',
  'lion_cgi_train_platform.png',
  'lion_claymation_bookshop.png',
  'lion_claymation_cafe_window.png',
  'lion_claymation_hotel_lobby.png',
  'lion_claymation_park_bench.png',
  'lion_claymation_rooftop_dawn.png',
  'lion_claymation_street_corner.png',
  'lion_claymation_train_platform.png',
  'lion_handdrawn_bookshop.png',
  'lion_handdrawn_cafe_window.png',
  'lion_handdrawn_hotel_lobby.png',
  'lion_handdrawn_park_bench.png',
  'lion_handdrawn_rooftop_dawn.png',
  'lion_handdrawn_street_corner.png',
  'lion_handdrawn_train_platform.png',
  'lion_puppet_bookshop.png',
  'lion_puppet_cafe_window.png',
  'lion_puppet_hotel_lobby.png',
  'lion_puppet_park_bench.png',
  'lion_puppet_rooftop_dawn.png',
  'lion_puppet_street_corner.png',
  'lion_puppet_train_platform.png',
  'lion_stopmotion_bookshop.png',
  'lion_stopmotion_cafe_window.png',
  'lion_stopmotion_hotel_lobby.png',
  'lion_stopmotion_park_bench.png',
  'lion_stopmotion_rooftop_dawn.png',
  'lion_stopmotion_street_corner.png',
  'lion_stopmotion_train_platform.png',
  'living_01_tiny_hiding_01_sugar_bowl_082316.png',
  'living_01_tiny_hiding_03_shelf_peek_082316.png',
  'living_02_child_wandering_01_crosswalk_082316.png',
  'living_02_child_wandering_02_diner_slide_082316.png',
  'living_02_child_wandering_04_door_pushing_082316.png',
  'living_03_human_confronting_01_bar_lean_082316.png',
  'living_03_human_confronting_03_elevator_nod_082316.png',
  'living_03_human_confronting_05_window_reflection_082316.png',
  'living_04_giant_gentle_01_door_ducking_082316.png',
  'living_04_giant_gentle_02_stool_perching_082316.png',
  'living_04_giant_gentle_03_child_kneeling_082316.png',
  'living_04_giant_gentle_04_phone_booth_082316.png',
  'panda_cgi_bookshop.png',
  'panda_cgi_cafe_window.png',
  'panda_cgi_diner_booth.png',
  'panda_cgi_park_bench.png',
  'panda_cgi_subway_car.png',
  'panda_cgi_train_platform.png',
  'panda_claymation_bookshop.png',
  'panda_claymation_cafe_window.png',
  'panda_claymation_diner_booth.png',
  'panda_claymation_park_bench.png',
  'panda_claymation_subway_car.png',
  'panda_claymation_train_platform.png',
  'panda_handdrawn_bookshop.png',
  'panda_handdrawn_cafe_window.png',
  'panda_handdrawn_diner_booth.png',
  'panda_handdrawn_park_bench.png',
  'panda_handdrawn_subway_car.png',
  'panda_handdrawn_train_platform.png',
  'panda_puppet_bookshop.png',
  'panda_puppet_cafe_window.png',
  'panda_puppet_diner_booth.png',
  'panda_puppet_subway_car.png',
  'panda_puppet_train_platform.png',
  'panda_stopmotion_bookshop.png',
  'panda_stopmotion_cafe_window.png',
  'panda_stopmotion_diner_booth.png',
  'panda_stopmotion_park_bench.png',
  'panda_stopmotion_subway_car.png',
  'panda_stopmotion_train_platform.png',
  'realistic_01_tiny_unnoticed_01_cafe_table_082316.png',
  'realistic_03_human_scale_01_bar_ordering_082316.png',
  'realistic_04_giant_looming_01_convenience_store_082316.png',
  'solitude_01_alone_in_house_01_frosted_window_082316.png',
  'solitude_01_alone_in_house_02_fireplace_082316.png',
  'solitude_02_bar_christmas_01_bar_end_082316.png',
  'solitude_02_bar_christmas_02_piano_corner_082316.png',
  'solitude_03_riding_bus_01_rain_window_082316.png',
  'solitude_03_riding_bus_02_back_row_082316.png',
  'solitude_04_office_alone_01_desk_lamp_082316.png',
  'styles_01_stop_motion_01_bar_stool_082316.png',
  'styles_01_stop_motion_02_bus_window_082316.png',
  'styles_01_stop_motion_03_diner_booth_082316.png',
  'styles_01_stop_motion_04_phone_booth_082316.png',
  'styles_02_claymation_01_park_bench_082316.png',
  'styles_02_claymation_02_subway_platform_082316.png',
  'styles_02_claymation_03_laundromat_082316.png',
  'styles_03_cgi_paddington_01_hotel_lobby_082316.png',
  'styles_03_cgi_paddington_02_train_station_082316.png',
  'styles_03_cgi_paddington_03_cafe_window_082316.png',
  'styles_04_practical_puppet_01_elevator_082316.png',
  'styles_04_practical_puppet_02_hospital_waiting_082316.png',
  'styles_04_practical_puppet_03_empty_theater_082316.png',
  'styles_04_practical_puppet_04_parking_garage_082316.png',
  'styles_05_handdrawn_composite_01_city_street_082316.png',
  'styles_05_handdrawn_composite_02_dive_bar_082316.png',
  'styles_05_handdrawn_composite_03_rooftop_082316.png',
  'styles_06_fabric_stopmotion_01_bookshop_082316.png',
  'styles_06_fabric_stopmotion_02_late_diner_082316.png',
  'styles_06_fabric_stopmotion_03_ferry_deck_082316.png',
  'styles_06_fabric_stopmotion_04_church_pew_082316.png',
  'teddy_melancholy_01_alone_in_house_01_window_watching_082316.png',
  'teddy_melancholy_01_alone_in_house_03_kitchen_table_082316.png',
  'teddy_melancholy_01_alone_in_house_05_stairs_sitting_082316.png',
  'teddy_melancholy_01_alone_in_house_07_piano_keys_082316.png',
  'teddy_melancholy_01_alone_in_house_08_doorway_leaving_082316.png',
  'teddy_melancholy_02_bar_christmas_01_bar_stool_082316.png',
  'teddy_melancholy_02_bar_christmas_02_jukebox_glow_082316.png',
  'teddy_melancholy_02_bar_christmas_04_window_booth_082316.png',
  'teddy_melancholy_02_bar_christmas_07_payphone_082316.png',
  'teddy_melancholy_02_bar_christmas_08_putting_on_coat_082316.png',
  'teddy_melancholy_03_riding_bus_01_window_seat_082316.png',
  'teddy_melancholy_03_riding_bus_03_bus_stop_082316.png',
  'teddy_melancholy_03_riding_bus_05_driver_nod_082316.png',
  'teddy_melancholy_03_riding_bus_07_sleeping_082316.png',
  'teddy_melancholy_03_riding_bus_08_end_of_line_082316.png',
  'teddy_melancholy_04_office_alone_01_desk_lamp_082316.png',
  'teddy_melancholy_04_office_alone_03_break_room_082316.png',
  'teddy_melancholy_04_office_alone_05_conference_room_082316.png',
  'teddy_melancholy_04_office_alone_07_parking_garage_082316.png',
  'teddy_melancholy_04_office_alone_08_security_desk_082316.png',
  'whale_cgi_bus_stop.png',
  'whale_cgi_hotel_lobby.png',
  'whale_cgi_laundromat.png',
  'whale_cgi_phone_booth.png',
  'whale_cgi_street_corner.png',
  'whale_cgi_subway_car.png',
  'whale_claymation_bus_stop.png',
  'whale_claymation_hotel_lobby.png',
  'whale_claymation_laundromat.png',
  'whale_claymation_phone_booth.png',
  'whale_claymation_street_corner.png',
  'whale_claymation_subway_car.png',
  'whale_handdrawn_bus_stop.png',
  'whale_handdrawn_hotel_lobby.png',
  'whale_handdrawn_laundromat.png',
  'whale_handdrawn_phone_booth.png',
  'whale_handdrawn_street_corner.png',
  'whale_handdrawn_subway_car.png',
  'whale_puppet_bus_stop.png',
  'whale_puppet_hotel_lobby.png',
  'whale_puppet_laundromat.png',
  'whale_puppet_phone_booth.png',
  'whale_puppet_street_corner.png',
  'whale_puppet_subway_car.png',
  'whale_stopmotion_bus_stop.png',
  'whale_stopmotion_hotel_lobby.png',
  'whale_stopmotion_laundromat.png',
  'whale_stopmotion_phone_booth.png',
  'whale_stopmotion_street_corner.png',
  'whale_stopmotion_subway_car.png'
];

// Build full asset list with images
const ALL_ASSETS = [
  ...STATIC_ASSETS,
  ...IMAGE_FILES.map(f => `./images/${f}`)
];

// API endpoints that should use network-first (future Firebase)
const API_PATTERNS = [
  /firebase/i,
  /firestore/i,
  /api\//i
];

/**
 * Install event - cache all static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets...');
        // Cache core assets first, then images progressively
        return cache.addAll(STATIC_ASSETS)
          .then(() => {
            // Cache images - don't fail install if some images fail
            const imagePromises = IMAGE_FILES.map(f => {
              return cache.add(`./images/${f}`).catch(err => {
                console.warn(`[SW] Failed to cache image: ${f}`, err);
              });
            });
            return Promise.all(imagePromises);
          });
      })
      .then(() => {
        console.log('[SW] Install complete');
        // Take control immediately
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('nutcracker-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activate complete');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Check if this is an API request (network-first)
  const isApiRequest = API_PATTERNS.some(pattern => pattern.test(url.href));

  if (isApiRequest) {
    // Network-first for API calls
    event.respondWith(networkFirst(request));
  } else {
    // Cache-first for static assets
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Cache-first strategy
 * Try cache, fall back to network, update cache
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Return cached response immediately
    // Optionally update cache in background (stale-while-revalidate)
    updateCache(request);
    return cachedResponse;
  }

  // Not in cache, try network
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.error('[SW] Fetch failed:', err);

    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('./index.html');
    }

    throw err;
  }
}

/**
 * Network-first strategy
 * Try network, fall back to cache
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.log('[SW] Network failed, trying cache:', request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    throw err;
  }
}

/**
 * Update cache in background (stale-while-revalidate)
 */
async function updateCache(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
  } catch (err) {
    // Network update failed, that's okay - we have cached version
  }
}

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
