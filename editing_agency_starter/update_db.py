import sqlite3

def upgrade():
    conn = sqlite3.connect('agency.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE jobs ADD COLUMN access_token VARCHAR")
        print("Adicionada coluna access_token")
    except sqlite3.OperationalError as e:
        print("Coluna access_token já existe ou erro:", e)

    try:
        cursor.execute("ALTER TABLE jobs ADD COLUMN drive_folder_id VARCHAR")
        print("Adicionada coluna drive_folder_id")
    except sqlite3.OperationalError as e:
        print("Coluna drive_folder_id já existe ou erro:", e)

    conn.commit()
    conn.close()

if __name__ == '__main__':
    upgrade()
