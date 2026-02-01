"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/generate-greeting/route";
exports.ids = ["app/api/generate-greeting/route"];
exports.modules = {

/***/ "../../client/components/action-async-storage.external":
/*!*******************************************************************************!*\
  !*** external "next/dist/client/components/action-async-storage.external.js" ***!
  \*******************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/action-async-storage.external.js");

/***/ }),

/***/ "../../client/components/request-async-storage.external":
/*!********************************************************************************!*\
  !*** external "next/dist/client/components/request-async-storage.external.js" ***!
  \********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/request-async-storage.external.js");

/***/ }),

/***/ "../../client/components/static-generation-async-storage.external":
/*!******************************************************************************************!*\
  !*** external "next/dist/client/components/static-generation-async-storage.external.js" ***!
  \******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/static-generation-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "node:fs":
/*!**************************!*\
  !*** external "node:fs" ***!
  \**************************/
/***/ ((module) => {

module.exports = require("node:fs");

/***/ }),

/***/ "node:stream":
/*!******************************!*\
  !*** external "node:stream" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("node:stream");

/***/ }),

/***/ "node:stream/web":
/*!**********************************!*\
  !*** external "node:stream/web" ***!
  \**********************************/
/***/ ((module) => {

module.exports = require("node:stream/web");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("path");

/***/ }),

/***/ "punycode":
/*!***************************!*\
  !*** external "punycode" ***!
  \***************************/
/***/ ((module) => {

module.exports = require("punycode");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("stream");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "worker_threads":
/*!*********************************!*\
  !*** external "worker_threads" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("worker_threads");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fgenerate-greeting%2Froute&page=%2Fapi%2Fgenerate-greeting%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fgenerate-greeting%2Froute.ts&appDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!***************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fgenerate-greeting%2Froute&page=%2Fapi%2Fgenerate-greeting%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fgenerate-greeting%2Froute.ts&appDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \***************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   headerHooks: () => (/* binding */ headerHooks),\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage),\n/* harmony export */   staticGenerationBailout: () => (/* binding */ staticGenerationBailout)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var C_Users_bogum_exoskull_exoskull_app_app_api_generate_greeting_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/generate-greeting/route.ts */ \"(rsc)/./app/api/generate-greeting/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/generate-greeting/route\",\n        pathname: \"/api/generate-greeting\",\n        filename: \"route\",\n        bundlePath: \"app/api/generate-greeting/route\"\n    },\n    resolvedPagePath: \"C:\\\\Users\\\\bogum\\\\exoskull\\\\exoskull-app\\\\app\\\\api\\\\generate-greeting\\\\route.ts\",\n    nextConfigOutput,\n    userland: C_Users_bogum_exoskull_exoskull_app_app_api_generate_greeting_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, headerHooks, staticGenerationBailout } = routeModule;\nconst originalPathname = \"/api/generate-greeting/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZnZW5lcmF0ZS1ncmVldGluZyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGZ2VuZXJhdGUtZ3JlZXRpbmclMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZnZW5lcmF0ZS1ncmVldGluZyUyRnJvdXRlLnRzJmFwcERpcj1DJTNBJTVDVXNlcnMlNUNib2d1bSU1Q2V4b3NrdWxsJTVDZXhvc2t1bGwtYXBwJTVDYXBwJnBhZ2VFeHRlbnNpb25zPXRzeCZwYWdlRXh0ZW5zaW9ucz10cyZwYWdlRXh0ZW5zaW9ucz1qc3gmcGFnZUV4dGVuc2lvbnM9anMmcm9vdERpcj1DJTNBJTVDVXNlcnMlNUNib2d1bSU1Q2V4b3NrdWxsJTVDZXhvc2t1bGwtYXBwJmlzRGV2PXRydWUmdHNjb25maWdQYXRoPXRzY29uZmlnLmpzb24mYmFzZVBhdGg9JmFzc2V0UHJlZml4PSZuZXh0Q29uZmlnT3V0cHV0PSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7OztBQUFzRztBQUN2QztBQUNjO0FBQytCO0FBQzVHO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsdUdBQXVHO0FBQy9HO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDNko7O0FBRTdKIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZXhvc2t1bGwvPzA0OWIiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwUm91dGVSb3V0ZU1vZHVsZSB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2Z1dHVyZS9yb3V0ZS1tb2R1bGVzL2FwcC1yb3V0ZS9tb2R1bGUuY29tcGlsZWRcIjtcbmltcG9ydCB7IFJvdXRlS2luZCB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2Z1dHVyZS9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiQzpcXFxcVXNlcnNcXFxcYm9ndW1cXFxcZXhvc2t1bGxcXFxcZXhvc2t1bGwtYXBwXFxcXGFwcFxcXFxhcGlcXFxcZ2VuZXJhdGUtZ3JlZXRpbmdcXFxccm91dGUudHNcIjtcbi8vIFdlIGluamVjdCB0aGUgbmV4dENvbmZpZ091dHB1dCBoZXJlIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGVtIGluIHRoZSByb3V0ZVxuLy8gbW9kdWxlLlxuY29uc3QgbmV4dENvbmZpZ091dHB1dCA9IFwiXCJcbmNvbnN0IHJvdXRlTW9kdWxlID0gbmV3IEFwcFJvdXRlUm91dGVNb2R1bGUoe1xuICAgIGRlZmluaXRpb246IHtcbiAgICAgICAga2luZDogUm91dGVLaW5kLkFQUF9ST1VURSxcbiAgICAgICAgcGFnZTogXCIvYXBpL2dlbmVyYXRlLWdyZWV0aW5nL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvZ2VuZXJhdGUtZ3JlZXRpbmdcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL2dlbmVyYXRlLWdyZWV0aW5nL3JvdXRlXCJcbiAgICB9LFxuICAgIHJlc29sdmVkUGFnZVBhdGg6IFwiQzpcXFxcVXNlcnNcXFxcYm9ndW1cXFxcZXhvc2t1bGxcXFxcZXhvc2t1bGwtYXBwXFxcXGFwcFxcXFxhcGlcXFxcZ2VuZXJhdGUtZ3JlZXRpbmdcXFxccm91dGUudHNcIixcbiAgICBuZXh0Q29uZmlnT3V0cHV0LFxuICAgIHVzZXJsYW5kXG59KTtcbi8vIFB1bGwgb3V0IHRoZSBleHBvcnRzIHRoYXQgd2UgbmVlZCB0byBleHBvc2UgZnJvbSB0aGUgbW9kdWxlLiBUaGlzIHNob3VsZFxuLy8gYmUgZWxpbWluYXRlZCB3aGVuIHdlJ3ZlIG1vdmVkIHRoZSBvdGhlciByb3V0ZXMgdG8gdGhlIG5ldyBmb3JtYXQuIFRoZXNlXG4vLyBhcmUgdXNlZCB0byBob29rIGludG8gdGhlIHJvdXRlLlxuY29uc3QgeyByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgaGVhZGVySG9va3MsIHN0YXRpY0dlbmVyYXRpb25CYWlsb3V0IH0gPSByb3V0ZU1vZHVsZTtcbmNvbnN0IG9yaWdpbmFsUGF0aG5hbWUgPSBcIi9hcGkvZ2VuZXJhdGUtZ3JlZXRpbmcvcm91dGVcIjtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgc2VydmVySG9va3MsXG4gICAgICAgIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgaGVhZGVySG9va3MsIHN0YXRpY0dlbmVyYXRpb25CYWlsb3V0LCBvcmlnaW5hbFBhdGhuYW1lLCBwYXRjaEZldGNoLCAgfTtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXBwLXJvdXRlLmpzLm1hcCJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fgenerate-greeting%2Froute&page=%2Fapi%2Fgenerate-greeting%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fgenerate-greeting%2Froute.ts&appDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./app/api/generate-greeting/route.ts":
/*!********************************************!*\
  !*** ./app/api/generate-greeting/route.ts ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/web/exports/next-response */ \"(rsc)/./node_modules/next/dist/server/web/exports/next-response.js\");\n/* harmony import */ var openai__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! openai */ \"(rsc)/./node_modules/openai/index.mjs\");\n/* harmony import */ var _lib_supabase_server__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/lib/supabase/server */ \"(rsc)/./lib/supabase/server.ts\");\n\n\n\nconst openai = new openai__WEBPACK_IMPORTED_MODULE_2__[\"default\"]({\n    apiKey: process.env.OPENAI_API_KEY\n});\nasync function POST(req) {\n    try {\n        const supabase = await (0,_lib_supabase_server__WEBPACK_IMPORTED_MODULE_1__.createClient)();\n        const { data: { user } } = await supabase.auth.getUser();\n        const { hour, lastConversationDays } = await req.json();\n        // Kontekst dla AI\n        const contextParts = [];\n        if (hour !== undefined) {\n            const timeOfDay = hour < 10 ? \"rano (przed 10:00)\" : hour < 18 ? \"w ciągu dnia (10-18)\" : hour < 22 ? \"wieczorem (18-22)\" : \"p\\xf3źno w nocy (po 22:00)\";\n            contextParts.push(`Pora dnia: ${timeOfDay}`);\n        }\n        if (lastConversationDays !== undefined && lastConversationDays > 0) {\n            contextParts.push(`Ostatnia rozmowa: ${lastConversationDays} dni temu`);\n        } else if (lastConversationDays === 0) {\n            contextParts.push(\"Ostatnia rozmowa: dzisiaj (kolejna rozmowa tego samego dnia)\");\n        }\n        // Load recent conversation context (last 5 messages)\n        let conversationHistory = \"\";\n        if (user) {\n            try {\n                const { data: recentMessages } = await supabase.from(\"exo_messages\").select(\"role, content, timestamp\").eq(\"tenant_id\", user.id).order(\"timestamp\", {\n                    ascending: false\n                }).limit(5);\n                if (recentMessages && recentMessages.length > 0) {\n                    const summaries = recentMessages.reverse().map((m)=>{\n                        const preview = m.content.substring(0, 100);\n                        return `${m.role === \"user\" ? \"User\" : \"ExoSkull\"}: ${preview}`;\n                    });\n                    conversationHistory = summaries.join(\"\\n\");\n                    contextParts.push(`Ostatnie rozmowy: ${recentMessages.length} wiadomości`);\n                }\n            } catch (e) {\n                console.log(\"No conversation history yet\");\n            }\n        }\n        const context = contextParts.join(\". \");\n        // Generuj greeting przez OpenAI\n        const completion = await openai.chat.completions.create({\n            model: \"gpt-4o-mini\",\n            messages: [\n                {\n                    role: \"system\",\n                    content: `Jesteś ExoSkull - drugi mózg użytkownika. Generujesz naturalne powitanie na początku rozmowy głosowej.\r\n\r\nZASADY:\r\n- ZAWSZE po polsku\r\n- Krótkie (max 2 zdania)\r\n- Naturalne, nie jak bot\r\n- Dopasowane do kontekstu (pora dnia, jak dawno ostatnia rozmowa)\r\n- Bez fraz botowych (\"czym mogę służyć\", \"jestem tutaj żeby pomóc\")\r\n- Bez wyjaśniania co robisz\r\n\r\nPRZYKŁADY (inspiracja, nie kopiuj dosłownie):\r\n- Rano, pierwszy raz: \"Dzień dobry. Jak się czujesz?\"\r\n- Rano, druga rozmowa: \"Hej ponownie. Co tam?\"\r\n- Wieczór: \"Jak minął dzień?\"\r\n- Późno: \"Jeszcze nie śpisz?\"\r\n- Po długiej przerwie: \"Długo Cię nie było. Co słychać?\"\r\n\r\nWYGENERUJ TYLKO greeting (bez dodatkowych komentarzy).`\n                },\n                {\n                    role: \"user\",\n                    content: `Kontekst: ${context}\r\n\r\n${conversationHistory ? `\\nOstatnie wiadomości:\\n${conversationHistory}\\n` : \"\"}\r\nWygeneruj naturalne powitanie:`\n                }\n            ],\n            temperature: 0.8,\n            max_tokens: 50\n        });\n        const greeting = completion.choices[0]?.message?.content?.trim() || \"Hej. Co tam?\";\n        return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json({\n            greeting,\n            context\n        });\n    } catch (error) {\n        console.error(\"Error generating greeting:\", error);\n        // Fallback\n        return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json({\n            greeting: \"Hej. Jak się masz?\",\n            error: \"Fallback greeting used\"\n        }, {\n            status: 200\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2dlbmVyYXRlLWdyZWV0aW5nL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBdUQ7QUFDNUI7QUFDeUI7QUFFcEQsTUFBTUcsU0FBUyxJQUFJRiw4Q0FBTUEsQ0FBQztJQUN4QkcsUUFBUUMsUUFBUUMsR0FBRyxDQUFDQyxjQUFjO0FBQ3BDO0FBRU8sZUFBZUMsS0FBS0MsR0FBZ0I7SUFDekMsSUFBSTtRQUNGLE1BQU1DLFdBQVcsTUFBTVIsa0VBQVlBO1FBQ25DLE1BQU0sRUFBRVMsTUFBTSxFQUFFQyxJQUFJLEVBQUUsRUFBRSxHQUFHLE1BQU1GLFNBQVNHLElBQUksQ0FBQ0MsT0FBTztRQUV0RCxNQUFNLEVBQUVDLElBQUksRUFBRUMsb0JBQW9CLEVBQUUsR0FBRyxNQUFNUCxJQUFJUSxJQUFJO1FBRXJELGtCQUFrQjtRQUNsQixNQUFNQyxlQUFlLEVBQUU7UUFFdkIsSUFBSUgsU0FBU0ksV0FBVztZQUN0QixNQUFNQyxZQUNKTCxPQUFPLEtBQUssdUJBQ1pBLE9BQU8sS0FBSyx5QkFDWkEsT0FBTyxLQUFLLHNCQUNaO1lBQ0ZHLGFBQWFHLElBQUksQ0FBQyxDQUFDLFdBQVcsRUFBRUQsVUFBVSxDQUFDO1FBQzdDO1FBRUEsSUFBSUoseUJBQXlCRyxhQUFhSCx1QkFBdUIsR0FBRztZQUNsRUUsYUFBYUcsSUFBSSxDQUFDLENBQUMsa0JBQWtCLEVBQUVMLHFCQUFxQixTQUFTLENBQUM7UUFDeEUsT0FBTyxJQUFJQSx5QkFBeUIsR0FBRztZQUNyQ0UsYUFBYUcsSUFBSSxDQUFDO1FBQ3BCO1FBRUEscURBQXFEO1FBQ3JELElBQUlDLHNCQUFzQjtRQUMxQixJQUFJVixNQUFNO1lBQ1IsSUFBSTtnQkFDRixNQUFNLEVBQUVELE1BQU1ZLGNBQWMsRUFBRSxHQUFHLE1BQU1iLFNBQ3BDYyxJQUFJLENBQUMsZ0JBQ0xDLE1BQU0sQ0FBQyw0QkFDUEMsRUFBRSxDQUFDLGFBQWFkLEtBQUtlLEVBQUUsRUFDdkJDLEtBQUssQ0FBQyxhQUFhO29CQUFFQyxXQUFXO2dCQUFNLEdBQ3RDQyxLQUFLLENBQUM7Z0JBRVQsSUFBSVAsa0JBQWtCQSxlQUFlUSxNQUFNLEdBQUcsR0FBRztvQkFDL0MsTUFBTUMsWUFBWVQsZUFBZVUsT0FBTyxHQUFHQyxHQUFHLENBQUNDLENBQUFBO3dCQUM3QyxNQUFNQyxVQUFVRCxFQUFFRSxPQUFPLENBQUNDLFNBQVMsQ0FBQyxHQUFHO3dCQUN2QyxPQUFPLENBQUMsRUFBRUgsRUFBRUksSUFBSSxLQUFLLFNBQVMsU0FBUyxXQUFXLEVBQUUsRUFBRUgsUUFBUSxDQUFDO29CQUNqRTtvQkFDQWQsc0JBQXNCVSxVQUFVUSxJQUFJLENBQUM7b0JBQ3JDdEIsYUFBYUcsSUFBSSxDQUFDLENBQUMsa0JBQWtCLEVBQUVFLGVBQWVRLE1BQU0sQ0FBQyxXQUFXLENBQUM7Z0JBQzNFO1lBQ0YsRUFBRSxPQUFPVSxHQUFHO2dCQUNWQyxRQUFRQyxHQUFHLENBQUM7WUFDZDtRQUNGO1FBRUEsTUFBTUMsVUFBVTFCLGFBQWFzQixJQUFJLENBQUM7UUFFbEMsZ0NBQWdDO1FBQ2hDLE1BQU1LLGFBQWEsTUFBTTFDLE9BQU8yQyxJQUFJLENBQUNDLFdBQVcsQ0FBQ0MsTUFBTSxDQUFDO1lBQ3REQyxPQUFPO1lBQ1BDLFVBQVU7Z0JBQ1I7b0JBQ0VYLE1BQU07b0JBQ05GLFNBQVMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7c0RBaUJrQyxDQUFDO2dCQUMvQztnQkFDQTtvQkFDRUUsTUFBTTtvQkFDTkYsU0FBUyxDQUFDLFVBQVUsRUFBRU8sUUFBUTs7QUFFeEMsRUFBRXRCLHNCQUFzQixDQUFDLHdCQUF3QixFQUFFQSxvQkFBb0IsRUFBRSxDQUFDLEdBQUcsR0FBRzs4QkFDbEQsQ0FBQztnQkFDdkI7YUFDRDtZQUNENkIsYUFBYTtZQUNiQyxZQUFZO1FBQ2Q7UUFFQSxNQUFNQyxXQUFXUixXQUFXUyxPQUFPLENBQUMsRUFBRSxFQUFFQyxTQUFTbEIsU0FBU21CLFVBQVU7UUFFcEUsT0FBT3hELGtGQUFZQSxDQUFDaUIsSUFBSSxDQUFDO1lBQ3ZCb0M7WUFDQVQ7UUFDRjtJQUVGLEVBQUUsT0FBT2EsT0FBTztRQUNkZixRQUFRZSxLQUFLLENBQUMsOEJBQThCQTtRQUU1QyxXQUFXO1FBQ1gsT0FBT3pELGtGQUFZQSxDQUFDaUIsSUFBSSxDQUFDO1lBQ3ZCb0MsVUFBVTtZQUNWSSxPQUFPO1FBQ1QsR0FBRztZQUFFQyxRQUFRO1FBQUk7SUFDbkI7QUFDRiIsInNvdXJjZXMiOlsid2VicGFjazovL2V4b3NrdWxsLy4vYXBwL2FwaS9nZW5lcmF0ZS1ncmVldGluZy9yb3V0ZS50cz81ZWI0Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5leHRSZXF1ZXN0LCBOZXh0UmVzcG9uc2UgfSBmcm9tICduZXh0L3NlcnZlcidcclxuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknXHJcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJ0AvbGliL3N1cGFiYXNlL3NlcnZlcidcclxuXHJcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoe1xyXG4gIGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkhXHJcbn0pXHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gUE9TVChyZXE6IE5leHRSZXF1ZXN0KSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHN1cGFiYXNlID0gYXdhaXQgY3JlYXRlQ2xpZW50KClcclxuICAgIGNvbnN0IHsgZGF0YTogeyB1c2VyIH0gfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpXHJcblxyXG4gICAgY29uc3QgeyBob3VyLCBsYXN0Q29udmVyc2F0aW9uRGF5cyB9ID0gYXdhaXQgcmVxLmpzb24oKVxyXG5cclxuICAgIC8vIEtvbnRla3N0IGRsYSBBSVxyXG4gICAgY29uc3QgY29udGV4dFBhcnRzID0gW11cclxuXHJcbiAgICBpZiAoaG91ciAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGNvbnN0IHRpbWVPZkRheSA9XHJcbiAgICAgICAgaG91ciA8IDEwID8gJ3Jhbm8gKHByemVkIDEwOjAwKScgOlxyXG4gICAgICAgIGhvdXIgPCAxOCA/ICd3IGNpxIVndSBkbmlhICgxMC0xOCknIDpcclxuICAgICAgICBob3VyIDwgMjIgPyAnd2llY3pvcmVtICgxOC0yMiknIDpcclxuICAgICAgICAncMOzxbpubyB3IG5vY3kgKHBvIDIyOjAwKSdcclxuICAgICAgY29udGV4dFBhcnRzLnB1c2goYFBvcmEgZG5pYTogJHt0aW1lT2ZEYXl9YClcclxuICAgIH1cclxuXHJcbiAgICBpZiAobGFzdENvbnZlcnNhdGlvbkRheXMgIT09IHVuZGVmaW5lZCAmJiBsYXN0Q29udmVyc2F0aW9uRGF5cyA+IDApIHtcclxuICAgICAgY29udGV4dFBhcnRzLnB1c2goYE9zdGF0bmlhIHJvem1vd2E6ICR7bGFzdENvbnZlcnNhdGlvbkRheXN9IGRuaSB0ZW11YClcclxuICAgIH0gZWxzZSBpZiAobGFzdENvbnZlcnNhdGlvbkRheXMgPT09IDApIHtcclxuICAgICAgY29udGV4dFBhcnRzLnB1c2goJ09zdGF0bmlhIHJvem1vd2E6IGR6aXNpYWogKGtvbGVqbmEgcm96bW93YSB0ZWdvIHNhbWVnbyBkbmlhKScpXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTG9hZCByZWNlbnQgY29udmVyc2F0aW9uIGNvbnRleHQgKGxhc3QgNSBtZXNzYWdlcylcclxuICAgIGxldCBjb252ZXJzYXRpb25IaXN0b3J5ID0gJydcclxuICAgIGlmICh1c2VyKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgeyBkYXRhOiByZWNlbnRNZXNzYWdlcyB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgICAgICAgIC5mcm9tKCdleG9fbWVzc2FnZXMnKVxyXG4gICAgICAgICAgLnNlbGVjdCgncm9sZSwgY29udGVudCwgdGltZXN0YW1wJylcclxuICAgICAgICAgIC5lcSgndGVuYW50X2lkJywgdXNlci5pZClcclxuICAgICAgICAgIC5vcmRlcigndGltZXN0YW1wJywgeyBhc2NlbmRpbmc6IGZhbHNlIH0pXHJcbiAgICAgICAgICAubGltaXQoNSlcclxuXHJcbiAgICAgICAgaWYgKHJlY2VudE1lc3NhZ2VzICYmIHJlY2VudE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGNvbnN0IHN1bW1hcmllcyA9IHJlY2VudE1lc3NhZ2VzLnJldmVyc2UoKS5tYXAobSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZpZXcgPSBtLmNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMClcclxuICAgICAgICAgICAgcmV0dXJuIGAke20ucm9sZSA9PT0gJ3VzZXInID8gJ1VzZXInIDogJ0V4b1NrdWxsJ306ICR7cHJldmlld31gXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgICAgY29udmVyc2F0aW9uSGlzdG9yeSA9IHN1bW1hcmllcy5qb2luKCdcXG4nKVxyXG4gICAgICAgICAgY29udGV4dFBhcnRzLnB1c2goYE9zdGF0bmllIHJvem1vd3k6ICR7cmVjZW50TWVzc2FnZXMubGVuZ3RofSB3aWFkb21vxZtjaWApXHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ05vIGNvbnZlcnNhdGlvbiBoaXN0b3J5IHlldCcpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjb250ZXh0ID0gY29udGV4dFBhcnRzLmpvaW4oJy4gJylcclxuXHJcbiAgICAvLyBHZW5lcnVqIGdyZWV0aW5nIHByemV6IE9wZW5BSVxyXG4gICAgY29uc3QgY29tcGxldGlvbiA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XHJcbiAgICAgIG1vZGVsOiAnZ3B0LTRvLW1pbmknLFxyXG4gICAgICBtZXNzYWdlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxyXG4gICAgICAgICAgY29udGVudDogYEplc3RlxZsgRXhvU2t1bGwgLSBkcnVnaSBtw7N6ZyB1xbx5dGtvd25pa2EuIEdlbmVydWplc3ogbmF0dXJhbG5lIHBvd2l0YW5pZSBuYSBwb2N6xIV0a3Ugcm96bW93eSBnxYJvc293ZWouXHJcblxyXG5aQVNBRFk6XHJcbi0gWkFXU1pFIHBvIHBvbHNrdVxyXG4tIEtyw7N0a2llIChtYXggMiB6ZGFuaWEpXHJcbi0gTmF0dXJhbG5lLCBuaWUgamFrIGJvdFxyXG4tIERvcGFzb3dhbmUgZG8ga29udGVrc3R1IChwb3JhIGRuaWEsIGphayBkYXdubyBvc3RhdG5pYSByb3ptb3dhKVxyXG4tIEJleiBmcmF6IGJvdG93eWNoIChcImN6eW0gbW9nxJkgc8WCdcW8ecSHXCIsIFwiamVzdGVtIHR1dGFqIMW8ZWJ5IHBvbcOzY1wiKVxyXG4tIEJleiB3eWphxZtuaWFuaWEgY28gcm9iaXN6XHJcblxyXG5QUlpZS8WBQURZIChpbnNwaXJhY2phLCBuaWUga29waXVqIGRvc8WCb3duaWUpOlxyXG4tIFJhbm8sIHBpZXJ3c3p5IHJhejogXCJEemllxYQgZG9icnkuIEphayBzacSZIGN6dWplc3o/XCJcclxuLSBSYW5vLCBkcnVnYSByb3ptb3dhOiBcIkhlaiBwb25vd25pZS4gQ28gdGFtP1wiXHJcbi0gV2llY3rDs3I6IFwiSmFrIG1pbsSFxYIgZHppZcWEP1wiXHJcbi0gUMOzxbpubzogXCJKZXN6Y3plIG5pZSDFm3Bpc3o/XCJcclxuLSBQbyBkxYJ1Z2llaiBwcnplcndpZTogXCJExYJ1Z28gQ2nEmSBuaWUgYnnFgm8uIENvIHPFgnljaGHEhz9cIlxyXG5cclxuV1lHRU5FUlVKIFRZTEtPIGdyZWV0aW5nIChiZXogZG9kYXRrb3d5Y2gga29tZW50YXJ6eSkuYFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxyXG4gICAgICAgICAgY29udGVudDogYEtvbnRla3N0OiAke2NvbnRleHR9XHJcblxyXG4ke2NvbnZlcnNhdGlvbkhpc3RvcnkgPyBgXFxuT3N0YXRuaWUgd2lhZG9tb8WbY2k6XFxuJHtjb252ZXJzYXRpb25IaXN0b3J5fVxcbmAgOiAnJ31cclxuV3lnZW5lcnVqIG5hdHVyYWxuZSBwb3dpdGFuaWU6YFxyXG4gICAgICAgIH1cclxuICAgICAgXSxcclxuICAgICAgdGVtcGVyYXR1cmU6IDAuOCxcclxuICAgICAgbWF4X3Rva2VuczogNTBcclxuICAgIH0pXHJcblxyXG4gICAgY29uc3QgZ3JlZXRpbmcgPSBjb21wbGV0aW9uLmNob2ljZXNbMF0/Lm1lc3NhZ2U/LmNvbnRlbnQ/LnRyaW0oKSB8fCAnSGVqLiBDbyB0YW0/J1xyXG5cclxuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7XHJcbiAgICAgIGdyZWV0aW5nLFxyXG4gICAgICBjb250ZXh0XHJcbiAgICB9KVxyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2VuZXJhdGluZyBncmVldGluZzonLCBlcnJvcilcclxuXHJcbiAgICAvLyBGYWxsYmFja1xyXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHtcclxuICAgICAgZ3JlZXRpbmc6ICdIZWouIEphayBzacSZIG1hc3o/JyxcclxuICAgICAgZXJyb3I6ICdGYWxsYmFjayBncmVldGluZyB1c2VkJ1xyXG4gICAgfSwgeyBzdGF0dXM6IDIwMCB9KVxyXG4gIH1cclxufVxyXG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiT3BlbkFJIiwiY3JlYXRlQ2xpZW50Iiwib3BlbmFpIiwiYXBpS2V5IiwicHJvY2VzcyIsImVudiIsIk9QRU5BSV9BUElfS0VZIiwiUE9TVCIsInJlcSIsInN1cGFiYXNlIiwiZGF0YSIsInVzZXIiLCJhdXRoIiwiZ2V0VXNlciIsImhvdXIiLCJsYXN0Q29udmVyc2F0aW9uRGF5cyIsImpzb24iLCJjb250ZXh0UGFydHMiLCJ1bmRlZmluZWQiLCJ0aW1lT2ZEYXkiLCJwdXNoIiwiY29udmVyc2F0aW9uSGlzdG9yeSIsInJlY2VudE1lc3NhZ2VzIiwiZnJvbSIsInNlbGVjdCIsImVxIiwiaWQiLCJvcmRlciIsImFzY2VuZGluZyIsImxpbWl0IiwibGVuZ3RoIiwic3VtbWFyaWVzIiwicmV2ZXJzZSIsIm1hcCIsIm0iLCJwcmV2aWV3IiwiY29udGVudCIsInN1YnN0cmluZyIsInJvbGUiLCJqb2luIiwiZSIsImNvbnNvbGUiLCJsb2ciLCJjb250ZXh0IiwiY29tcGxldGlvbiIsImNoYXQiLCJjb21wbGV0aW9ucyIsImNyZWF0ZSIsIm1vZGVsIiwibWVzc2FnZXMiLCJ0ZW1wZXJhdHVyZSIsIm1heF90b2tlbnMiLCJncmVldGluZyIsImNob2ljZXMiLCJtZXNzYWdlIiwidHJpbSIsImVycm9yIiwic3RhdHVzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/api/generate-greeting/route.ts\n");

/***/ }),

/***/ "(rsc)/./lib/supabase/server.ts":
/*!********************************!*\
  !*** ./lib/supabase/server.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createClient: () => (/* binding */ createClient)\n/* harmony export */ });\n/* harmony import */ var _supabase_ssr__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @supabase/ssr */ \"(rsc)/./node_modules/@supabase/ssr/dist/index.mjs\");\n/* harmony import */ var next_headers__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/headers */ \"(rsc)/./node_modules/next/dist/api/headers.js\");\n\n\nasync function createClient() {\n    const cookieStore = await (0,next_headers__WEBPACK_IMPORTED_MODULE_1__.cookies)();\n    return (0,_supabase_ssr__WEBPACK_IMPORTED_MODULE_0__.createServerClient)(\"https://uvupnwvkzreikurymncs.supabase.co\", \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dXBud3ZrenJlaWt1cnltbmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTYyODMsImV4cCI6MjA4NTUzMjI4M30.PXSMO4Dwq7s-Iywi1lYcPz0eyDpAHxIM47jLOP9y_Zo\", {\n        cookies: {\n            get (name) {\n                return cookieStore.get(name)?.value;\n            },\n            set (name, value, options) {\n                try {\n                    cookieStore.set({\n                        name,\n                        value,\n                        ...options\n                    });\n                } catch (error) {\n                // Server Component - can't set cookie\n                }\n            },\n            remove (name, options) {\n                try {\n                    cookieStore.set({\n                        name,\n                        value: \"\",\n                        ...options\n                    });\n                } catch (error) {\n                // Server Component - can't remove cookie\n                }\n            }\n        }\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9saWIvc3VwYWJhc2Uvc2VydmVyLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUFzRTtBQUNoQztBQUUvQixlQUFlRTtJQUNwQixNQUFNQyxjQUFjLE1BQU1GLHFEQUFPQTtJQUVqQyxPQUFPRCxpRUFBa0JBLENBQ3ZCSSwwQ0FBb0MsRUFDcENBLGtOQUF5QyxFQUN6QztRQUNFSCxTQUFTO1lBQ1BPLEtBQUlDLElBQVk7Z0JBQ2QsT0FBT04sWUFBWUssR0FBRyxDQUFDQyxPQUFPQztZQUNoQztZQUNBQyxLQUFJRixJQUFZLEVBQUVDLEtBQWEsRUFBRUUsT0FBc0I7Z0JBQ3JELElBQUk7b0JBQ0ZULFlBQVlRLEdBQUcsQ0FBQzt3QkFBRUY7d0JBQU1DO3dCQUFPLEdBQUdFLE9BQU87b0JBQUM7Z0JBQzVDLEVBQUUsT0FBT0MsT0FBTztnQkFDZCxzQ0FBc0M7Z0JBQ3hDO1lBQ0Y7WUFDQUMsUUFBT0wsSUFBWSxFQUFFRyxPQUFzQjtnQkFDekMsSUFBSTtvQkFDRlQsWUFBWVEsR0FBRyxDQUFDO3dCQUFFRjt3QkFBTUMsT0FBTzt3QkFBSSxHQUFHRSxPQUFPO29CQUFDO2dCQUNoRCxFQUFFLE9BQU9DLE9BQU87Z0JBQ2QseUNBQXlDO2dCQUMzQztZQUNGO1FBQ0Y7SUFDRjtBQUVKIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZXhvc2t1bGwvLi9saWIvc3VwYWJhc2Uvc2VydmVyLnRzPzY2MjUiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY3JlYXRlU2VydmVyQ2xpZW50LCB0eXBlIENvb2tpZU9wdGlvbnMgfSBmcm9tICdAc3VwYWJhc2Uvc3NyJ1xyXG5pbXBvcnQgeyBjb29raWVzIH0gZnJvbSAnbmV4dC9oZWFkZXJzJ1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUNsaWVudCgpIHtcclxuICBjb25zdCBjb29raWVTdG9yZSA9IGF3YWl0IGNvb2tpZXMoKVxyXG5cclxuICByZXR1cm4gY3JlYXRlU2VydmVyQ2xpZW50KFxyXG4gICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1VQQUJBU0VfVVJMISxcclxuICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NVUEFCQVNFX0FOT05fS0VZISxcclxuICAgIHtcclxuICAgICAgY29va2llczoge1xyXG4gICAgICAgIGdldChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICAgIHJldHVybiBjb29raWVTdG9yZS5nZXQobmFtZSk/LnZhbHVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzZXQobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBvcHRpb25zOiBDb29raWVPcHRpb25zKSB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb29raWVTdG9yZS5zZXQoeyBuYW1lLCB2YWx1ZSwgLi4ub3B0aW9ucyB9KVxyXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgLy8gU2VydmVyIENvbXBvbmVudCAtIGNhbid0IHNldCBjb29raWVcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIHJlbW92ZShuYW1lOiBzdHJpbmcsIG9wdGlvbnM6IENvb2tpZU9wdGlvbnMpIHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvb2tpZVN0b3JlLnNldCh7IG5hbWUsIHZhbHVlOiAnJywgLi4ub3B0aW9ucyB9KVxyXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgLy8gU2VydmVyIENvbXBvbmVudCAtIGNhbid0IHJlbW92ZSBjb29raWVcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfVxyXG4gIClcclxufVxyXG4iXSwibmFtZXMiOlsiY3JlYXRlU2VydmVyQ2xpZW50IiwiY29va2llcyIsImNyZWF0ZUNsaWVudCIsImNvb2tpZVN0b3JlIiwicHJvY2VzcyIsImVudiIsIk5FWFRfUFVCTElDX1NVUEFCQVNFX1VSTCIsIk5FWFRfUFVCTElDX1NVUEFCQVNFX0FOT05fS0VZIiwiZ2V0IiwibmFtZSIsInZhbHVlIiwic2V0Iiwib3B0aW9ucyIsImVycm9yIiwicmVtb3ZlIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./lib/supabase/server.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@supabase","vendor-chunks/tslib","vendor-chunks/iceberg-js","vendor-chunks/ramda","vendor-chunks/cookie","vendor-chunks/formdata-node","vendor-chunks/openai","vendor-chunks/form-data-encoder","vendor-chunks/whatwg-url","vendor-chunks/agentkeepalive","vendor-chunks/tr46","vendor-chunks/web-streams-polyfill","vendor-chunks/node-fetch","vendor-chunks/webidl-conversions","vendor-chunks/ms","vendor-chunks/humanize-ms","vendor-chunks/event-target-shim","vendor-chunks/abort-controller"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fgenerate-greeting%2Froute&page=%2Fapi%2Fgenerate-greeting%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fgenerate-greeting%2Froute.ts&appDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cbogum%5Cexoskull%5Cexoskull-app&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();