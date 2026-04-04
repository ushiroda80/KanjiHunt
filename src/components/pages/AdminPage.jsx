import React, { useState, useEffect } from 'react';
import { getAdminUsers } from '../../lib/api';

const AdminPage = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAdminUsers()
      .then(u => { setUsers(u); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Sort by last sign-in (most recent first)
  const sorted = [...users].sort((a, b) => new Date(b.lastSignIn || 0) - new Date(a.lastSignIn || 0));

  const totalWords = users.reduce((sum, u) => sum + (u.totalWords || 0), 0);
  const totalCaptures = users.reduce((sum, u) => sum + (u.capturesThisMonth || 0), 0);

  const timeAgo = (dateStr) => {
    if (!dateStr) return '—';
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  };

  const accountAge = (dateStr) => {
    if (!dateStr) return '—';
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days < 1) return 'today';
    if (days === 1) return '1 day';
    return days + ' days';
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#fafafa', zIndex: 210, overflowY: 'auto',
      padding: '20px 20px 100px'
    }}>
      <div style={{ maxWidth: '430px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>Admin</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: '600', color: '#5f6368', cursor: 'pointer', padding: '8px' }}>Done</button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}/>
            <p style={{ marginTop: '12px', fontSize: '13px' }}>Loading users…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', borderRadius: '12px', padding: '16px', color: '#991b1b', fontSize: '13px' }}>
            Failed to load: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e' }}>{users.length}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Users</div>
              </div>
              <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e' }}>{totalWords}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Total words</div>
              </div>
              <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e' }}>{totalCaptures}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Captures this month</div>
              </div>
            </div>

            {/* User list */}
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '4px' }}>
              Users ({sorted.length})
            </div>
            <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              {sorted.map((user, i) => (
                <div key={user.uid} style={{ padding: '14px 16px', borderBottom: i < sorted.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
                        {user.displayName || 'No name'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>
                        {user.email || 'No email'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>
                        {user.capturesThisMonth} <span style={{ fontSize: '10px', fontWeight: '400', color: '#888' }}>/ 100</span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#888' }}>this month</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', color: '#888' }}>
                    <span>{user.totalWords} words</span>
                    <span>Joined {accountAge(user.createdAt)}</span>
                    <span>Last seen {timeAgo(user.lastSignIn)}</span>
                  </div>
                </div>
              ))}
              {sorted.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No users found</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
