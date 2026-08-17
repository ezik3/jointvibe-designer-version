// Shared list of available cities across the app
export const APP_CITIES = [
  "Brisbane",
  "Sydney", 
  "Melbourne",
  "Adelaide",
  "Hobart",
  "Perth",
  "New York",
  "Los Angeles",
  "London",
  "Tokyo",
  "Paris",
  "Dubai",
  "Gold Coast",
] as const;

export type AppCity = typeof APP_CITIES[number];
