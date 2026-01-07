import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import RollDetail from './pages/RollDetail';
import Receive from './pages/Receive';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Inventory": Inventory,
    "RollDetail": RollDetail,
    "Receive": Receive,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};