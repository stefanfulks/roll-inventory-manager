import BundleDetail from './pages/BundleDetail';
import Bundles from './pages/Bundles';
import CutRoll from './pages/CutRoll';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import JobDetail from './pages/JobDetail';
import Jobs from './pages/Jobs';
import Locations from './pages/Locations';
import Products from './pages/Products';
import Receive from './pages/Receive';
import Returns from './pages/Returns';
import RollDetail from './pages/RollDetail';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Reports from './pages/Reports';
import __Layout from './Layout.jsx';


export const PAGES = {
    "BundleDetail": BundleDetail,
    "Bundles": Bundles,
    "CutRoll": CutRoll,
    "Dashboard": Dashboard,
    "Inventory": Inventory,
    "JobDetail": JobDetail,
    "Jobs": Jobs,
    "Locations": Locations,
    "Products": Products,
    "Receive": Receive,
    "Returns": Returns,
    "RollDetail": RollDetail,
    "Transactions": Transactions,
    "Settings": Settings,
    "Help": Help,
    "Reports": Reports,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};