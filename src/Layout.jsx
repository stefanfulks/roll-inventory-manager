import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { 
  LayoutDashboard, 
  Package, 
  Scissors, 
  Truck, 
  ClipboardList,
  FileBox,
  RotateCcw,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Building2,
  MapPin,
  Users,
  FileSpreadsheet,
  FileBarChart,
  HelpCircle,
  Search,
  Archive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import GlobalSearch from '@/components/GlobalSearch';
import InventoryAssistant from '@/components/InventoryAssistant';

const navItems = [
  { name: 'Dashboard', page: 'Dashboard', icon: LayoutDashboard },
  { name: 'Inventory', page: 'Inventory', icon: Package },
  { name: 'Pending', page: 'PendingInventory', icon: FileBox },
  { name: 'Receive', page: 'Receive', icon: FileSpreadsheet },
  { name: 'Cut Roll', page: 'CutRoll', icon: Scissors },
  { name: 'Jobs', page: 'Jobs', icon: ClipboardList },
  { name: 'Returns', page: 'Returns', icon: RotateCcw },
];

const adminItems = [
  { name: 'Turf', page: 'Products', icon: Package },
  { name: 'Other Inventory', page: 'InventoryItems', icon: Package },
  { name: 'Locations', page: 'Locations', icon: MapPin },
  { name: 'Transactions', page: 'Transactions', icon: FileSpreadsheet },
  { name: 'Turf Overage', page: 'TurfOverageReport', icon: FileBarChart },
  { name: 'Archived Jobs', page: 'ArchivedJobs', icon: Archive },
  { name: 'Settings', page: 'Settings', icon: Settings },
  { name: 'Reports', page: 'Reports', icon: FileBarChart },
  { name: 'Help', page: 'Help', icon: HelpCircle },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        console.log('Not logged in');
      }
    };
    loadUser();
    // Ensure dark class is never applied
    document.documentElement.classList.remove('dark');
  }, []);

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] transition-colors duration-300">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        :root {
          --primary: 210 100% 30%;
          --primary-foreground: 0 0% 100%;
          --accent: 135 63% 44%;
          --background: 210 20% 98%;
          --panel: 0 0% 100%;
          --text: 222 47% 11%;
        }


      `}</style>
      
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#2d2d2d] border-b border-slate-200 dark:border-slate-700/50 z-50 flex items-center justify-between px-4 backdrop-blur-lg bg-opacity-95 dark:bg-opacity-95">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#87c71a] to-[#6fa615] rounded-lg flex items-center justify-center shadow-lg shadow-[#87c71a]/20">
            <span className="text-black font-bold text-sm">TT</span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-white">TexasTurf</span>
        </div>
        <div className="w-10" />
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white dark:bg-[#2d2d2d] border-r border-slate-200 dark:border-slate-700/50 z-50
        transform transition-transform duration-300 ease-in-out backdrop-blur-lg bg-opacity-95 dark:bg-opacity-95
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#87c71a] to-[#6fa615] rounded-xl flex items-center justify-center shadow-lg shadow-[#87c71a]/20">
                <span className="text-black font-bold">TT</span>
              </div>
              <div>
                <h1 className="font-bold text-slate-800 dark:text-white text-lg leading-tight">TexasTurf</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Inventory Tracker</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <GlobalSearch />

            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-3">
              Main Menu
            </div>
            {navItems.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                    ${isActive 
                      ? 'bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-900/30 dark:text-emerald-400' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                    }
                  `}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-6 mb-3 px-3">
              Admin
            </div>
            {adminItems.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                    ${isActive 
                      ? 'bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-900/30 dark:text-emerald-400' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                    }
                  `}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          {user && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-700/50 space-y-3">

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start gap-3 h-auto py-2 dark:hover:bg-slate-700/50">
                    <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        {user.full_name?.[0] || user.email?.[0] || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                        {user.full_name || 'User'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 dark:bg-[#2d2d2d] dark:border-slate-700/50">
                  <DropdownMenuItem className="text-slate-600 dark:text-slate-300">
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                      {user.role || 'user'}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="dark:bg-slate-700/50" />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* Floating AI Assistant (on every page) */}
      <InventoryAssistant />
    </div>
  );
}