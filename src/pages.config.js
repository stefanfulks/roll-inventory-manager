/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import ArchivedJobs from './pages/ArchivedJobs';
import CutRoll from './pages/CutRoll';
import Dashboard from './pages/Dashboard';
import Help from './pages/Help';
import Inventory from './pages/Inventory';
import InventoryItems from './pages/InventoryItems';
import JobDetail from './pages/JobDetail';
import Jobs from './pages/Jobs';
import Locations from './pages/Locations';
import PendingInventory from './pages/PendingInventory';
import Products from './pages/Products';
import Receive from './pages/Receive';
import Reports from './pages/Reports';
import Returns from './pages/Returns';
import RollDetail from './pages/RollDetail';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import TurfOverageReport from './pages/TurfOverageReport';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ArchivedJobs": ArchivedJobs,
    "CutRoll": CutRoll,
    "Dashboard": Dashboard,
    "Help": Help,
    "Inventory": Inventory,
    "InventoryItems": InventoryItems,
    "JobDetail": JobDetail,
    "Jobs": Jobs,
    "Locations": Locations,
    "PendingInventory": PendingInventory,
    "Products": Products,
    "Receive": Receive,
    "Reports": Reports,
    "Returns": Returns,
    "RollDetail": RollDetail,
    "Settings": Settings,
    "Transactions": Transactions,
    "TurfOverageReport": TurfOverageReport,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};