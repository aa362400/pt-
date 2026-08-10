import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Bell,
  CreditCard,
  Key,
  Lock,
  Mail,
  Edit,
  Trash2,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Crown,
} from 'lucide-react';

export function TeamSettings() {
  const [activeTab, setActiveTab] = useState('team');

  const teamMembers = [
    {
      id: 1,
      name: 'english_text',
      email: 'jieke@email.com',
      role: 'owner',
      avatar: 'JK',
      status: 'active',
      joinedAt: '2024-01-15',
      lastActive: 'text',
      permissions: ['Alltext'],
    },
    {
      id: 2,
      name: 'english_text',
      email: 'xiaoming@email.com',
      role: 'admin',
      avatar: 'LX',
      status: 'active',
      joinedAt: '2024-02-20',
      lastActive: '5english_text',
      permissions: ['Product Management', 'orderstext', 'Customer Service'],
    },
    {
      id: 3,
      name: 'english_text',
      email: 'xiaohong@email.com',
      role: 'member',
      avatar: 'WX',
      status: 'active',
      joinedAt: '2024-03-10',
      lastActive: '1english_text',
      permissions: ['Product Management', 'english_text'],
    },
    {
      id: 4,
      name: 'english_text',
      email: 'yunying@email.com',
      role: 'member',
      avatar: 'LY',
      status: 'invited',
      joinedAt: '2024-07-10',
      lastActive: '-',
      permissions: ['datatext'],
    },
  ];

  const roleConfig = {
    owner: { label: 'Owner', color: 'bg-purple-100 text-purple-700', icon: Crown },
    admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700', icon: Shield },
    member: { label: 'Member', color: 'bg-gray-100 text-gray-700', icon: Users },
  };

  const statusConfig = {
    active: { label: 'Active', color: 'bg-green-50 text-green-700 border-green-200' },
    invited: { label: 'Pending acceptance', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    inactive: { label: 'Disabled', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  };

  const tabs = [
    { key: 'team', label: 'teamMember', icon: Users },
    { key: 'permissions', label: 'Permission management', icon: Shield },
    { key: 'notifications', label: 'Notification settings', icon: Bell },
    { key: 'billing', label: 'Billing and plans', icon: CreditCard },
    { key: 'api', label: 'API keys', icon: Key },
    { key: 'security', label: 'Security settings', icon: Lock },
  ];

  return (
    <div className="p-8">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team and Settings</h1>
        <p className="text-gray-500 mt-1">textteamMember、text、english_text</p>
      </div>

      {/* english_text */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm transition-colors relative ${
                activeTab === tab.key
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
              )}
            </button>
          ))}
        </div>

        {/* teamMembertext */}
        {activeTab === 'team' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">teamMember</h2>
                <p className="text-sm text-gray-500 mt-1">english_text {teamMembers.length} textMember</p>
              </div>
              <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
                <UserPlus className="w-5 h-5" />
                textMember
              </button>
            </div>

            {/* Membertext */}
            <div className="space-y-3">
              {teamMembers.map((member) => (
                <div key={member.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {member.avatar}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-gray-900">{member.name}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          roleConfig[member.role as keyof typeof roleConfig].color
                        }`}>
                          {React.createElement(roleConfig[member.role as keyof typeof roleConfig].icon, { className: "w-3 h-3" })}
                          {roleConfig[member.role as keyof typeof roleConfig].label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                          statusConfig[member.status as keyof typeof statusConfig].color
                        }`}>
                          {statusConfig[member.status as keyof typeof statusConfig].label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {member.email}
                        </span>
                        <span>•</span>
                        <span>english_text {member.joinedAt}</span>
                        <span>•</span>
                        <span>textActive：{member.lastActive}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {member.permissions.map((perm, index) => (
                          <span key={index} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {member.role !== 'owner' && (
                        <>
                          <button className="p-2 hover:bg-gray-100 rounded-lg">
                            <Edit className="w-4 h-4 text-gray-600" />
                          </button>
                          <button className="p-2 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </>
                      )}
                      <button className="p-2 hover:bg-gray-100 rounded-lg">
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permission managementtext */}
        {activeTab === 'permissions' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">text��text</h2>
              <p className="text-sm text-gray-500 mt-1">english_textconfigurationenglish_text</p>
            </div>

            <div className="space-y-6">
              {['Admin', 'Member'].map((role) => (
                <div key={role} className="border border-gray-200 rounded-lg p-6">
                  <h3 className="font-bold text-gray-900 mb-4">{role}text</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { name: 'Product Management', enabled: true },
                      { name: 'orderstext', enabled: true },
                      { name: 'Customer Service', enabled: true },
                      { name: 'Data Analysis', enabled: role === 'Admin' },
                      { name: 'Marketing Ads', enabled: role === 'Admin' },
                      { name: 'Approval Center', enabled: role === 'Admin' },
                      { name: 'Automation Flow', enabled: role === 'Admin' },
                      { name: 'Platform Connections', enabled: role === 'Admin' },
                      { name: 'teamtext', enabled: role === 'Admin' },
                      { name: 'english_text', enabled: role === 'Admin' },
                    ].map((perm, index) => (
                      <label key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                        <input
                          type="checkbox"
                          checked={perm.enabled}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notification settingstext */}
        {activeTab === 'notifications' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">Notification settings</h2>
              <p className="text-sm text-gray-500 mt-1">english_textmessagenotificationtext</p>
            </div>

            <div className="space-y-6">
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-4">ordersnotification</h3>
                <div className="space-y-3">
                  {[
                    { label: 'textorderstext', description: 'english_textordersenglish_textnotification', enabled: true },
                    { label: 'ordersIssuetext', description: 'orderstextIssueenglish_textnotification', enabled: true },
                    { label: 'Refundenglish_text', description: 'customertextRefundenglish_textnotification', enabled: true },
                  ].map((item, index) => (
                    <label key={index} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-4">AI textnotification</h3>
                <div className="space-y-3">
                  {[
                    { label: 'AI texttasknotification', description: 'AI Doneautomatictexttaskenglish_textnotification', enabled: true },
                    { label: 'approvalrequestnotification', description: 'AI english_texthumanapprovaltexttask', enabled: true },
                    { label: 'Issuetextnotification', description: 'AI detectionenglish_textriskenglish_textnotification', enabled: true },
                    { label: 'english_textnotification', description: 'AI english_text', enabled: false },
                  ].map((item, index) => (
                    <label key={index} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Billing and planstext */}
        {activeTab === 'billing' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">Billing and plans</h2>
              <p className="text-sm text-gray-500 mt-1">english_text</p>
            </div>

            {/* english_text */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-6 border border-blue-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">english_text</h3>
                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs font-medium">english_text</span>
                  </div>
                  <p className="text-gray-700 mb-4">$199/text · english_text：2024-08-15</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Connectedstore</div>
                      <div className="text-lg font-bold text-gray-900">5 / 10</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Productstext</div>
                      <div className="text-lg font-bold text-gray-900">1,248 / 5,000</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">teamMember</div>
                      <div className="text-lg font-bold text-gray-900">4 / 10</div>
                    </div>
                  </div>
                </div>
                <button className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                  english_text
                </button>
              </div>
            </div>

            {/* english_text */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-bold text-gray-900">english_text</h3>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">text</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">text</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">text</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">text</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[
                    { date: '2024-07-15', desc: 'english_text', amount: '$199.00', status: 'paid' },
                    { date: '2024-06-15', desc: 'english_text', amount: '$199.00', status: 'paid' },
                    { date: '2024-05-15', desc: 'english_text', amount: '$199.00', status: 'paid' },
                  ].map((bill, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{bill.date}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{bill.desc}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{bill.amount}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">english_text</span>
                      </td>
                      <td className="px-6 py-4">
                        <button className="text-sm text-blue-600 hover:text-blue-700">english_text</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* API keystext */}
        {activeTab === 'api' && (
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">API keys</h2>
                <p className="text-sm text-gray-500 mt-1">english_text API keys</p>
              </div>
              <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
                <Key className="w-5 h-5" />
                english_textsecret
              </button>
            </div>

            <div className="space-y-3">
              {[
                { name: 'english_textsecret', key: 'pk_live_****************************8f2a', created: '2024-01-15', lastUsed: '2 hours ago', status: 'active' },
                { name: 'english_textsecret', key: 'pk_test_****************************9b3c', created: '2024-01-15', lastUsed: '3text', status: 'active' },
              ].map((api, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-gray-900">{api.name}</h3>
                        <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">Active</span>
                      </div>
                      <div className="font-mono text-sm text-gray-600 mb-2">{api.key}</div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>english_text {api.created}</span>
                        <span>•</span>
                        <span>english_text：{api.lastUsed}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-100 rounded-lg">
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button className="p-2 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <strong>securitytext：</strong>english_text API keys，english_textpublicenglish_text。english_textsecrettext，english_textsecret。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security settingstext */}
        {activeTab === 'security' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">Security settings</h2>
              <p className="text-sm text-gray-500 mt-1">english_textdatasecurity</p>
            </div>

            <div className="space-y-6">
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">english_text</h3>
                    <p className="text-sm text-gray-500 mt-1">english_textsecuritytext</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-600">english_text</span>
                  </div>
                </div>
                <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                  english_text
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">english_text</h3>
                    <p className="text-sm text-gray-500 mt-1">english_text</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { device: 'Chrome on MacOS', location: 'text，text', time: 'text', current: true },
                    { device: 'Safari on iPhone', location: 'text，text', time: '2 hours ago', current: false },
                    { device: 'Chrome on Windows', location: 'text，text', time: '1text', current: false },
                  ].map((log, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{log.device}</div>
                        <div className="text-xs text-gray-500">{log.location} · {log.time}</div>
                      </div>
                      {log.current && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">english_text</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-4">english_text</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">english_text</label>
                    <input type="password" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">english_text</label>
                    <input type="password" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">english_text</label>
                    <input type="password" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow">
                    english_text
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
