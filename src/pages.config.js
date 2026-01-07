import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import RollDetail from './pages/RollDetail';
import Receive from './pages/Receive';
import CutRoll from './pages/CutRoll';
import Bundles from './pages/Bundles';
import BundleDetail from './pages/BundleDetail';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Returns from './pages/Returns';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Inventory": Inventory,
    "RollDetail": RollDetail,
    "Receive": Receive,
    "CutRoll": CutRoll,
    "Bundles": Bundles,
    "BundleDetail": BundleDetail,
    "Jobs": Jobs,
    "JobDetail": JobDetail,
    "Returns": Returns,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};