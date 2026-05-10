const API_URL = "https://script.google.com/macros/s/AKfycbzOhvYrDFrXe6vo7hjeMkuFH0GJ2exdLNfzy9ZyPASiCu-JcmXY7yHTxixNq29tACB5Jg/exec";

let CONFIG = {};

async function loadConfig() {
  try {
    const response = await fetch(API_URL + "?mode=config_all");
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    if (!data.subdivisions || !data.machines || !data.staff || !data.projects)
      throw new Error("Invalid config structure");
    CONFIG = data;
    console.log("✅ Config Loaded");
  } catch (error) {
    console.error("❌ Config Load Failed:", error);
    throw error;
  }
}