import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Scissors, 
  FileBox,
  ClipboardList,
  RotateCcw,
  FileSpreadsheet,
  MapPin,
  Settings,
  FileBarChart,
  HelpCircle
} from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function Help() {
  const sections = [
    {
      icon: LayoutDashboard,
      title: 'Dashboard',
      description: 'Overview of your inventory with key metrics and analytics',
      tips: [
        'View total available square footage across all inventory',
        'Monitor low inventory alerts for products running low',
        'Track rolls on hold from returns',
        'Analyze inventory distribution by product, width, and length',
        'Use charts to identify inventory imbalances'
      ]
    },
    {
      icon: Package,
      title: 'Inventory',
      description: 'Browse and manage all turf rolls in the warehouse',
      tips: [
        'Use filters to quickly find specific rolls by status, type, or product',
        'Search by roll tag, product name, dye lot, or location',
        'Click on any roll to view detailed information and history',
        'Export filtered inventory to CSV for reporting',
        'Parent rolls show remaining length after cuts, Child rolls show exact cut length'
      ]
    },
    {
      icon: FileSpreadsheet,
      title: 'Receive',
      description: 'Add new inventory rolls to the system',
      tips: [
        'Single Entry: Add one roll at a time with full details',
        'Rapid Entry: Quickly add multiple rolls with identical settings',
        'CSV Upload: Bulk import rolls from a spreadsheet (download template first)',
        'Roll tags must be entered based on pre-printed tags attached to physical rolls',
        'Custom SKUs are auto-generated but can be edited',
        'Recently created rolls are shown at the bottom for quick verification'
      ]
    },
    {
      icon: Scissors,
      title: 'Cut Roll',
      description: 'Cut a parent roll to create a smaller child roll',
      tips: [
        'Enter the roll tag SKU to find the parent roll',
        'Specify how many feet to cut from the parent',
        'System automatically updates parent remaining length',
        'New child roll gets unique tag and full tracking',
        'Choose to send child roll to inventory or directly to a bundle',
        'Both parent and child transactions are logged for audit trail'
      ]
    },
    {
      icon: FileBox,
      title: 'Bundles',
      description: 'Create and manage shipment bundles for customer jobs',
      tips: [
        'Create bundles for specific jobs or standalone shipments',
        'Add rolls to bundles by scanning or searching',
        'View dye lot breakdown to ensure color consistency',
        'Track bundle status: Draft → Picking → Ready → Shipped',
        'Remove rolls from bundle if still in Draft or Picking status',
        'Shipping a bundle updates all contained rolls to Shipped status'
      ]
    },
    {
      icon: ClipboardList,
      title: 'Jobs',
      description: 'Track customer jobs and allocate inventory',
      tips: [
        'Create jobs with just a job number and company (TexasTurf or TurfCasa)',
        'Add allocation requests specifying product, width, and length needed',
        'System suggests best matching rolls based on product and dye lot',
        'Reserve rolls to ensure they\'re held for specific jobs',
        'Track fulfillment percentage to see allocation progress',
        'Link bundles to jobs for organized shipment tracking'
      ]
    },
    {
      icon: RotateCcw,
      title: 'Returns',
      description: 'Process returned turf rolls from job sites',
      tips: [
        'Existing Tagged Roll: Process returns for rolls already in system',
        'New Untagged Roll: Create new entries for returns without existing tags',
        'Returned rolls go to ReturnedHold status for inspection',
        'Add notes about condition or reason for return',
        'Update location to Returns Bay for proper warehouse organization'
      ]
    },
    {
      icon: FileBarChart,
      title: 'Reports',
      description: 'Generate detailed reports for tracking and analysis',
      tips: [
        'Current Inventory Report: Full snapshot of all rolls with status and location',
        'Low Inventory Report: Products falling below threshold settings',
        'Long-Sitting Inventory: Rolls that haven\'t moved in configured days',
        'Transaction Log: Complete audit trail of all inventory movements',
        'Export all reports as both CSV and PDF formats',
        'Use filters to generate specific reports by owner, status, or date range'
      ]
    },
    {
      icon: Package,
      title: 'Turf Products (Admin)',
      description: 'Manage turf product catalog and SKU codes',
      tips: [
        'Add new turf product types as inventory expands',
        'Set standard roll lengths for each product',
        'Define available widths (13ft, 15ft, etc.)',
        'Add SKU codes for integration with other systems',
        'Mark products as inactive when discontinued'
      ]
    },
    {
      icon: Package,
      title: 'Other Inventory Items (Admin)',
      description: 'Manage accessories, materials, and other inventory items',
      tips: [
        'Add new non-turf inventory items with categories, UOM, and unit definitions',
        'Track quantity on hand and minimum stock levels',
        'Edit details for existing inventory items',
        'Filter and search items by name, SKU, or category'
      ]
    },
    {
      icon: MapPin,
      title: 'Locations (Admin)',
      description: 'Organize warehouse storage locations',
      tips: [
        'Create locations for racks, zones, staging areas, and trucks',
        'Use consistent naming (e.g., Rack A-1, A-2, etc.)',
        'Designate specific areas for returns inspection',
        'Track truck locations for rolls in transit',
        'Good location organization speeds up picking and shipping',
        'Utilize suggested locations for quick setup of common areas like Aggregate Bins or specific Warehouses'
      ]
    },
    {
      icon: FileSpreadsheet,
      title: 'Transactions (Admin)',
      description: 'Complete audit trail of all inventory movements',
      tips: [
        'Every inventory change creates a transaction record',
        'Filter by transaction type to analyze specific operations',
        'Export transaction history for accounting or auditing',
        'Track who performed each action and when',
        'Use length changes to verify inventory accuracy'
      ]
    },
    {
      icon: Settings,
      title: 'Settings (Admin)',
      description: 'Configure system alerts and thresholds',
      tips: [
        'Set low inventory threshold (e.g., 5 rolls) to get alerts',
        'Configure how many days before products are flagged as long-sitting',
        'Adjust thresholds based on business needs and seasonality',
        'Settings apply across all dashboard and report alerts'
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <HelpCircle className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Help & Documentation</h1>
          <p className="text-slate-500 mt-1">Learn how to use TexasTurf inventory tracker effectively</p>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((section, idx) => (
          <Card key={idx} className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <section.icon className="h-6 w-6 text-slate-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-slate-800 mb-2">{section.title}</h2>
                <p className="text-slate-600 mb-4">{section.description}</p>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Tips & Tricks:</h3>
                  <ul className="space-y-1.5">
                    {section.tips.map((tip, tipIdx) => (
                      <li key={tipIdx} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="text-emerald-600 mt-1">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6 bg-emerald-50 border-emerald-200">
        <h3 className="font-semibold text-emerald-900 mb-2">Need More Help?</h3>
        <p className="text-sm text-emerald-800">
          For additional support or to report issues, contact your system administrator or warehouse manager.
        </p>
      </Card>
    </div>
  );
}