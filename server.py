import json
import sqlite3
import os
import base64
import secrets
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_PATH = 'expenses.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS expenses (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               description TEXT NOT NULL,
               amount REAL NOT NULL,
               date TEXT NOT NULL,
               category TEXT NOT NULL,
               payer TEXT NOT NULL,
               month_key TEXT NOT NULL,
               receipt_path TEXT
           )'''
    )
    # Ensure receipt_path exists for legacy databases
    try:
        cur.execute('PRAGMA table_info(expenses)')
        cols = [r[1] for r in cur.fetchall()]
        if 'receipt_path' not in cols:
            cur.execute('ALTER TABLE expenses ADD COLUMN receipt_path TEXT')
    except Exception:
        pass
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS balances (
               month_key TEXT PRIMARY KEY,
               starting_balance REAL NOT NULL,
               updated_at TEXT NOT NULL
           )'''
    )
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS savings (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               name TEXT NOT NULL,
               target REAL NOT NULL,
               current REAL NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL
           )'''
    )
    # Itemized expenses table
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS expense_items (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               expense_id INTEGER NOT NULL,
               name TEXT NOT NULL,
               amount REAL NOT NULL,
               FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE
           )'''
    )
    # Users and sessions for authentication
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS users (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               username TEXT UNIQUE NOT NULL,
               password_hash TEXT NOT NULL,
               salt TEXT NOT NULL,
               role TEXT NOT NULL DEFAULT 'user',
               created_at TEXT NOT NULL
           )'''
    )
    # Ensure role column exists for legacy databases
    try:
        cur.execute('PRAGMA table_info(users)')
        ucols = [r[1] for r in cur.fetchall()]
        if 'role' not in ucols:
            cur.execute('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT "user"')
    except Exception:
        pass
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS sessions (
               token TEXT PRIMARY KEY,
               user_id INTEGER NOT NULL,
               created_at TEXT NOT NULL,
               expires_at TEXT NOT NULL,
               FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
           )'''
    )
    # Seed admin user if not exists
    try:
        cur.execute('SELECT id FROM users WHERE username=?', ('Weasley',))
        row = cur.fetchone()
        if not row:
            admin_salt = secrets.token_hex(16)
            admin_pwd = '6FjVCVYLcpm3XAiJ81gQWd'
            admin_hash = hashlib.sha256((admin_salt + admin_pwd).encode('utf-8')).hexdigest()
            cur.execute('INSERT INTO users(username, password_hash, salt, role, created_at) VALUES(?,?,?,?,datetime("now"))',
                        ('Weasley', admin_hash, admin_salt, 'admin'))
    except Exception:
        pass
    conn.commit()
    conn.close()

def dictify_expense(row):
    return {
        'id': row[0],
        'description': row[1],
        'amount': row[2],
        'date': row[3],
        'category': row[4],
        'payer': row[5],
        'month_key': row[6],
        'receipt_path': row[7] if len(row) > 7 else None,
    }

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get('Origin')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Credentials', 'true')
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _set_cookie(self, name, value, max_age=None):
        if max_age is None:
            # Session cookie (expires when the browser closes)
            self.send_header('Set-Cookie', f'{name}={value}; Path=/; HttpOnly; SameSite=Lax')
        else:
            self.send_header('Set-Cookie', f'{name}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax')

    def _clear_cookie(self, name):
        self.send_header('Set-Cookie', f'{name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')

    def _get_session_user(self):
        cookie = self.headers.get('Cookie') or ''
        token = None
        for part in cookie.split(';'):
            kv = part.strip().split('=', 1)
            if len(kv) == 2 and kv[0] == 'session':
                token = kv[1]
                break
        if not token:
            return None
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('SELECT user_id FROM sessions WHERE token=? AND expires_at > datetime("now")', (token,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        return row[0]

    def _send_json(self, payload, status=200):
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        # Auth: allow auth endpoints without session, require for others
        if not path.startswith('/api/auth'):
            uid = self._get_session_user()
            if uid is None:
                self._send_json({'error': 'Unauthorized'}, status=401)
                return
        # Auth endpoints
        if path == '/api/auth/me':
            uid = self._get_session_user()
            if uid is None:
                self._send_json({'authenticated': False}, status=401)
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT id, username, role FROM users WHERE id=?', (uid,))
            row = cur.fetchone()
            conn.close()
            if not row:
                self._send_json({'authenticated': False}, status=401)
                return
            self._send_json({'authenticated': True, 'user': {'id': row[0], 'username': row[1], 'role': row[2]}})
            return
        if path == '/api/expenses':
            month = qs.get('month', [None])[0]
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            if month:
                cur.execute('SELECT * FROM expenses WHERE month_key=? ORDER BY date DESC, id DESC', (month,))
            else:
                cur.execute('SELECT * FROM expenses ORDER BY date DESC, id DESC')
            rows = cur.fetchall()
            # Fetch items for these expenses
            exp_ids = [r[0] for r in rows]
            items_map = {}
            if exp_ids:
                qmarks = ','.join('?' for _ in exp_ids)
                cur.execute(f'SELECT id, expense_id, name, amount FROM expense_items WHERE expense_id IN ({qmarks})', exp_ids)
                for iid, eid, name, amount in cur.fetchall():
                    items_map.setdefault(eid, []).append({'id': iid, 'name': name, 'amount': amount})
            conn.close()
            expenses_payload = []
            for r in rows:
                exp = dictify_expense(r)
                exp['items'] = items_map.get(exp['id'], [])
                expenses_payload.append(exp)
            self._send_json({'expenses': expenses_payload})
            return
        if path == '/api/balances':
            month = qs.get('month', [None])[0]
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            if month:
                cur.execute('SELECT starting_balance, updated_at FROM balances WHERE month_key=?', (month,))
                row = cur.fetchone()
                conn.close()
                if row:
                    self._send_json({'month_key': month, 'starting_balance': row[0], 'updated_at': row[1]})
                else:
                    self._send_json({'month_key': month, 'starting_balance': 0, 'updated_at': None})
            else:
                cur.execute('SELECT month_key, starting_balance, updated_at FROM balances')
                rows = cur.fetchall()
                conn.close()
                self._send_json({'balances': [{'month_key': r[0], 'starting_balance': r[1], 'updated_at': r[2]} for r in rows]})
            return
        if path == '/api/savings':
            # Only admins can view savings per role policy
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            uid = self._get_session_user()
            cur.execute('SELECT role FROM users WHERE id=?', (uid,))
            rrow = cur.fetchone()
            if not rrow or rrow[0] != 'admin':
                conn.close()
                self._send_json({'error': 'Forbidden'}, status=403)
                return
            cur.execute('SELECT id, name, target, current, created_at FROM savings ORDER BY id DESC')
            rows = cur.fetchall()
            conn.close()
            self._send_json({'savings': [
                {'id': r[0], 'name': r[1], 'target': r[2], 'current': r[3], 'created_at': r[4]}
            for r in rows]})
            return
        # Serve receipt files
        if path.startswith('/api/receipts/'):
            # Protect receipts behind auth
            uid = self._get_session_user()
            if uid is None:
                self._send_json({'error': 'Unauthorized'}, status=401)
                return
            fname = path.split('/api/receipts/', 1)[1]
            fpath = os.path.join('receipts', fname)
            if not os.path.isfile(fpath):
                self._send_json({'error': 'Receipt not found'}, status=404)
                return
            try:
                with open(fpath, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self._cors()
                # Generic content type
                self.send_header('Content-Type', 'application/octet-stream')
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception as e:
                self._send_json({'error': str(e)}, status=500)
                return
        self._send_json({'error': 'Not found'}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        # Defer body parsing to individual handlers to allow per-route error handling
        data = None
        # Auth endpoints
        if path == '/api/auth/register':
            try:
                # Public registration disabled
                self._send_json({'error': 'Registration disabled'}, status=403)
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path == '/api/auth/login':
            try:
                data = self._read_body()
                username = (data.get('username') or '').strip()
                password = (data.get('password') or '').strip()
                remember = bool(data.get('remember'))
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('SELECT id, password_hash, salt FROM users WHERE username=?', (username,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    self._send_json({'error': 'Invalid credentials'}, status=401)
                    return
                uid, pwd_hash, salt = row
                calc = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
                if calc != pwd_hash:
                    conn.close()
                    self._send_json({'error': 'Invalid credentials'}, status=401)
                    return
                token = secrets.token_hex(24)
                if remember:
                    cur.execute('INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?, ?, datetime("now"), datetime("now", "+30 days"))', (token, uid))
                else:
                    # Short session expiry; cookie is a session cookie
                    cur.execute('INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?, ?, datetime("now"), datetime("now", "+12 hours"))', (token, uid))
                conn.commit()
                conn.close()
                self.send_response(200)
                self._cors()
                self._set_cookie('session', token, None if not remember else 2592000)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path == '/api/auth/logout':
            try:
                # Remove session if present
                cookie = self.headers.get('Cookie') or ''
                token = None
                for part in cookie.split(';'):
                    kv = part.strip().split('=', 1)
                    if len(kv) == 2 and kv[0] == 'session':
                        token = kv[1]
                        break
                if token:
                    conn = sqlite3.connect(DB_PATH)
                    cur = conn.cursor()
                    cur.execute('DELETE FROM sessions WHERE token=?', (token,))
                    conn.commit()
                    conn.close()
                self.send_response(200)
                self._cors()
                self._clear_cookie('session')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        # For non-auth endpoints, require session
        if not path.startswith('/api/auth'):
            uid = self._get_session_user()
            if uid is None:
                self._send_json({'error': 'Unauthorized'}, status=401)
                return
        # Admin: create users
        if path == '/api/admin/users':
            try:
                # Ensure admin
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('SELECT role FROM users WHERE id=?', (uid,))
                row = cur.fetchone()
                if not row or row[0] != 'admin':
                    conn.close()
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                data = self._read_body() if data is None else data
                username = (data.get('username') or '').strip()
                password = (data.get('password') or '').strip()
                role = (data.get('role') or 'user').strip().lower()
                if not username or not password:
                    conn.close()
                    self._send_json({'error': 'Missing username or password'}, status=400)
                    return
                # Validate role
                allowed_roles = {'user','viewer','editor','admin'}
                if role not in allowed_roles:
                    conn.close()
                    self._send_json({'error': 'Invalid role'}, status=400)
                    return
                # Basic strong password check
                has_letter = any(c.isalpha() for c in password)
                has_digit = any(c.isdigit() for c in password)
                if len(password) < 12 or not (has_letter and has_digit):
                    conn.close()
                    self._send_json({'error': 'Password must be at least 12 chars with letters and digits'}, status=400)
                    return
                # Create user
                salt = secrets.token_hex(16)
                pwd_hash = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
                try:
                    cur.execute('INSERT INTO users(username, password_hash, salt, role, created_at) VALUES(?,?,?,?,datetime("now"))',
                                (username, pwd_hash, salt, role))
                    new_id = cur.lastrowid
                    conn.commit()
                    conn.close()
                    self._send_json({'success': True, 'user_id': new_id}, status=201)
                    return
                except sqlite3.IntegrityError:
                    conn.close()
                    self._send_json({'error': 'Username already exists'}, status=409)
                    return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        # Admin: list users
        if path == '/api/admin/users/list':
            try:
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('SELECT role FROM users WHERE id=?', (uid,))
                row = cur.fetchone()
                if not row or row[0] != 'admin':
                    conn.close()
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                cur.execute('SELECT id, username, role, created_at FROM users ORDER BY id ASC')
                users = [{'id': r[0], 'username': r[1], 'role': r[2], 'created_at': r[3]} for r in cur.fetchall()]
                conn.close()
                self._send_json({'users': users})
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path == '/api/expenses':
            try:
                # Only editor or admin can add expenses
                conn_role = sqlite3.connect(DB_PATH)
                cur_role = conn_role.cursor()
                cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
                r = cur_role.fetchone()
                conn_role.close()
                if not r or r[0] not in ('editor','admin'):
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                if data is None:
                    data = self._read_body()
                desc = data.get('description')
                amt = data.get('amount')
                date = data.get('date')
                cat = data.get('category')
                payer = data.get('payer')
                receipt_name = data.get('receipt_name')
                receipt_base64 = data.get('receipt_base64')
                items = data.get('items') or []
                if not all([desc, amt is not None, date, cat, payer]):
                    self._send_json({'error': 'Missing fields'}, status=400)
                    return
                month_key = f"{date[:7]}"
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                receipt_path = None
                # Save expense first to get ID
                cur.execute('INSERT INTO expenses(description, amount, date, category, payer, month_key, receipt_path) VALUES(?,?,?,?,?,?,?)',
                            (desc, float(amt), date, cat, payer, month_key, None))
                new_id = cur.lastrowid
                # Handle receipt if provided
                if receipt_base64 and receipt_name:
                    try:
                        os.makedirs('receipts', exist_ok=True)
                        safe_name = f"expense_{new_id}_" + os.path.basename(receipt_name)
                        fpath = os.path.join('receipts', safe_name)
                        with open(fpath, 'wb') as f:
                            f.write(base64.b64decode(receipt_base64))
                        receipt_path = safe_name
                        cur.execute('UPDATE expenses SET receipt_path=? WHERE id=?', (receipt_path, new_id))
                    except Exception as e:
                        # If receipt fails, continue without blocking
                        pass
                # Insert items if any
                for it in items:
                    name = it.get('name')
                    iam = it.get('amount')
                    if name and iam is not None:
                        cur.execute('INSERT INTO expense_items(expense_id, name, amount) VALUES(?,?,?)', (new_id, name, float(iam)))
                conn.commit()
                cur.execute('SELECT * FROM expenses WHERE id=?', (new_id,))
                row = cur.fetchone()
                conn.close()
                exp = dictify_expense(row)
                exp['items'] = items
                self._send_json({'expense': exp}, status=201)
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path == '/api/balances':
            try:
                # Only admin can update starting balance
                conn_role = sqlite3.connect(DB_PATH)
                cur_role = conn_role.cursor()
                cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
                r = cur_role.fetchone()
                conn_role.close()
                if not r or r[0] != 'admin':
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                if data is None:
                    data = self._read_body()
                month_key = data.get('month_key')
                starting_balance = data.get('starting_balance')
                if month_key is None or starting_balance is None:
                    self._send_json({'error': 'Missing fields'}, status=400)
                    return
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                # Portable upsert: update first, then insert if no row
                cur.execute('UPDATE balances SET starting_balance=?, updated_at=datetime("now") WHERE month_key=?',
                            (float(starting_balance), month_key))
                if cur.rowcount == 0:
                    cur.execute('INSERT INTO balances(month_key, starting_balance, updated_at) VALUES(?,?,datetime("now"))',
                                (month_key, float(starting_balance)))
                conn.commit()
                cur.execute('SELECT starting_balance, updated_at FROM balances WHERE month_key=?', (month_key,))
                row = cur.fetchone()
                conn.close()
                self._send_json({'month_key': month_key, 'starting_balance': row[0], 'updated_at': row[1]}, status=200)
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path == '/api/savings':
            try:
                # Only admin can create savings goals
                conn_role = sqlite3.connect(DB_PATH)
                cur_role = conn_role.cursor()
                cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
                r = cur_role.fetchone()
                conn_role.close()
                if not r or r[0] != 'admin':
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                if data is None:
                    data = self._read_body()
                name = data.get('name')
                target = data.get('target')
                if not name or target is None:
                    self._send_json({'error': 'Missing fields'}, status=400)
                    return
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('INSERT INTO savings(name, target, current, created_at) VALUES(?,?,0,datetime("now"))',
                            (name, float(target)))
                new_id = cur.lastrowid
                conn.commit()
                cur.execute('SELECT id, name, target, current, created_at FROM savings WHERE id=?', (new_id,))
                row = cur.fetchone()
                conn.close()
                self._send_json({'saving': {'id': row[0], 'name': row[1], 'target': row[2], 'current': row[3], 'created_at': row[4]}}, status=201)
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path == '/api/expense-items':
            try:
                # Only editor or admin can add items
                conn_role = sqlite3.connect(DB_PATH)
                cur_role = conn_role.cursor()
                cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
                r = cur_role.fetchone()
                conn_role.close()
                if not r or r[0] not in ('editor','admin'):
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                if data is None:
                    data = self._read_body()
                expense_id = int(data.get('expense_id'))
                name = (data.get('name') or '').strip()
                amount = float(data.get('amount'))
                if not expense_id or not name or amount <= 0:
                    self._send_json({'error': 'Invalid item payload'}, status=400)
                    return
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('INSERT INTO expense_items(expense_id, name, amount) VALUES(?,?,?)', (expense_id, name, amount))
                item_id = cur.lastrowid
                conn.commit()
                conn.close()
                self._send_json({'item': {'id': item_id, 'expense_id': expense_id, 'name': name, 'amount': amount}}, status=201)
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        if path.startswith('/api/savings/') and path.endswith('/contribute'):
            try:
                # Only admin can contribute to savings
                conn_role = sqlite3.connect(DB_PATH)
                cur_role = conn_role.cursor()
                cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
                r = cur_role.fetchone()
                conn_role.close()
                if not r or r[0] != 'admin':
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                if data is None:
                    data = self._read_body()
                parts = path.split('/')
                # /api/savings/{id}/contribute
                sid = int(parts[3])
                amount = data.get('amount')
                if amount is None:
                    self._send_json({'error': 'Missing amount'}, status=400)
                    return
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('UPDATE savings SET current = current + ? WHERE id=?', (float(amount), sid))
                if cur.rowcount == 0:
                    conn.close()
                    self._send_json({'error': 'Saving not found'}, status=404)
                    return
                conn.commit()
                cur.execute('SELECT id, name, target, current, created_at FROM savings WHERE id=?', (sid,))
                row = cur.fetchone()
                conn.close()
                self._send_json({'saving': {'id': row[0], 'name': row[1], 'target': row[2], 'current': row[3], 'created_at': row[4]}}, status=200)
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        self._send_json({'error': 'Not found'}, status=404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        # Require auth for deletions
        uid = self._get_session_user()
        if uid is None:
            self._send_json({'error': 'Unauthorized'}, status=401)
            return
        if parsed.path.startswith('/api/expenses/'):
            try:
                expense_id = int(parsed.path.split('/')[-1])
            except Exception:
                self._send_json({'error': 'Invalid ID'}, status=400)
                return
            # Only editor or admin can delete expenses
            conn_role = sqlite3.connect(DB_PATH)
            cur_role = conn_role.cursor()
            cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
            r = cur_role.fetchone()
            conn_role.close()
            if not r or r[0] not in ('editor','admin'):
                self._send_json({'error': 'Forbidden'}, status=403)
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('DELETE FROM expenses WHERE id=?', (expense_id,))
            conn.commit()
            conn.close()
            self._send_json({'success': True})
            return
        if parsed.path.startswith('/api/expense-items/'):
            parts = parsed.path.split('/')
            try:
                item_id = int(parts[-1])
            except Exception:
                self._send_json({'error': 'Invalid item ID'}, status=400)
                return
            # Only editor or admin can delete items
            conn_role = sqlite3.connect(DB_PATH)
            cur_role = conn_role.cursor()
            cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
            r = cur_role.fetchone()
            conn_role.close()
            if not r or r[0] not in ('editor','admin'):
                self._send_json({'error': 'Forbidden'}, status=403)
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('DELETE FROM expense_items WHERE id=?', (item_id,))
            conn.commit()
            conn.close()
            self._send_json({'success': True})
            return
        if parsed.path.startswith('/api/savings/'):
            try:
                sid = int(parsed.path.split('/')[-1])
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                # Only admin can delete savings
                conn_role = sqlite3.connect(DB_PATH)
                cur_role = conn_role.cursor()
                cur_role.execute('SELECT role FROM users WHERE id=?', (uid,))
                r = cur_role.fetchone()
                conn_role.close()
                if not r or r[0] != 'admin':
                    conn.close()
                    self._send_json({'error': 'Forbidden'}, status=403)
                    return
                cur.execute('DELETE FROM savings WHERE id=?', (sid,))
                conn.commit()
                conn.close()
                self._send_json({'success': True})
                return
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._send_json({'error': str(e)}, status=500)
                return
        self._send_json({'error': 'Not found'}, status=404)

def run():
    init_db()
    port = int(os.environ.get('PORT', '5000'))
    host = os.environ.get('HOST', '0.0.0.0')
    server_address = (host, port)
    httpd = HTTPServer(server_address, Handler)
    print(f'API server running on http://{host}:{port}')
    httpd.serve_forever()

if __name__ == '__main__':
    run()