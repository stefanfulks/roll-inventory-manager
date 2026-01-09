import CutRoll from './pages/CutRoll';
import Dashboard from './pages/Dashboard';
import Help from './pages/Help';
import Inventory from './pages/Inventory';
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
import ArchivedJobs from './pages/ArchivedJobs';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CutRoll": CutRoll,
    "Dashboard": Dashboard,
    "Help": Help,
    "Inventory": Inventory,
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
    "ArchivedJobs": ArchivedJobs,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};