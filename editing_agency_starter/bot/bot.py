import os
import sys
from dotenv import load_dotenv

# Carrega o .env antes de importar qualquer modulo de banco
_root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_dotenv_path = os.path.join(_root_dir, ".env")
if os.path.exists(_dotenv_path):
    load_dotenv(_dotenv_path)
else:
    load_dotenv()

# Add parent dir to sys.path to import backend modules
sys.path.append(_root_dir)
from backend.database import SessionLocal, User, Job

import discord
from discord.ext import commands, tasks
from discord.ui import Button, View

TOKEN = os.getenv('DISCORD_BOT_TOKEN')
GUILD_ID = int(os.getenv('DISCORD_GUILD_ID', 0))
ROLE_CLIENT_ID = int(os.getenv('ROLE_CLIENT_ID', 0))
ROLE_EDITOR_ID = int(os.getenv('ROLE_EDITOR_ID', 0))
LOG_CHANNEL_ID = int(os.getenv('LOG_CHANNEL_ID', 0))

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents)

@tasks.loop(minutes=5)
async def sync_users():
    print("[BOT] Checking Discord members and syncing with database...")
    if not GUILD_ID:
        print("[BOT] ERROR: GUILD_ID not set in .env")
        return
    guild = bot.get_guild(GUILD_ID)
    if not guild:
        print(f"[BOT] ERROR: Could not find guild with ID {GUILD_ID}")
        return

    db = SessionLocal()
    try:
        # Sync clients
        if ROLE_CLIENT_ID:
            client_role = guild.get_role(ROLE_CLIENT_ID)
            if client_role:
                print(f"[BOT] Syncing {len(client_role.members)} clients...")
                for member in client_role.members:
                    user = db.query(User).filter(User.discord_id == str(member.id)).first()
                    if not user:
                        db.add(User(discord_id=str(member.id), name=member.name, role='client'))
            else:
                print(f"[BOT] WARNING: Client role (ID {ROLE_CLIENT_ID}) not found in server.")

        # Sync editors
        if ROLE_EDITOR_ID:
            editor_role = guild.get_role(ROLE_EDITOR_ID)
            if editor_role:
                print(f"[BOT] Syncing {len(editor_role.members)} editors...")
                for member in editor_role.members:
                    user = db.query(User).filter(User.discord_id == str(member.id)).first()
                    if not user:
                        db.add(User(discord_id=str(member.id), name=member.name, role='editor'))
            else:
                print(f"[BOT] WARNING: Editor role (ID {ROLE_EDITOR_ID}) not found in server.")
                
        db.commit()
        print("[BOT] Sync complete.")
    finally:
        db.close()

@tasks.loop(seconds=10)
async def check_jobs():
    if not GUILD_ID: return
    guild = bot.get_guild(GUILD_ID)
    if not guild: return
    
    db = SessionLocal()
    try:
        # Find jobs assigned to an editor but channels not created yet
        new_jobs = db.query(Job).filter(Job.editor_id != None, Job.channels_created == False).all()
        for job in new_jobs:
            editor = job.editor
            client = job.client
            if not editor or not client: continue
            
            # Mark immediately as processed to prevent race conditions
            job.channels_created = True
            db.commit()
            
            # Reuse existing category for Editor if already created
            category_name = f"✂️ {editor.name}"
            category = discord.utils.get(guild.categories, name=category_name)
            if not category:
                category = await guild.create_category(category_name)
                # Set permissions: only guild owner, bot, and editor can see
                await category.set_permissions(guild.default_role, read_messages=False)
                editor_member = guild.get_member(int(editor.discord_id))
                if editor_member:
                    await category.set_permissions(editor_member, read_messages=True, send_messages=True)
            
            # Check and create chat channel only if it does not already exist
            chat_channel_name = f"📋・job-{job.id}"
            chat_channel = discord.utils.get(guild.channels, name=chat_channel_name)
            if not chat_channel:
                chat_channel = await guild.create_text_channel(chat_channel_name, category=category)
                await chat_channel.send(
                    f"🎬 **NEW JOB**\n\n"
                    f"**Project:** {job.title}\n"
                    f"**Service:** {job.service}\n\n"
                    f"**Description:**\n{job.description}\n\n"
                    f"*Use the command `!finish` in this channel when you complete the editing.*"
                )
            
            # Check and create files channel only if it does not already exist
            files_channel_name = f"📦・files-{job.id}"
            files_channel = discord.utils.get(guild.channels, name=files_channel_name)
            if not files_channel:
                files_channel = await guild.create_text_channel(files_channel_name, category=category)
                site_url = 'http://127.0.0.1:8000'
                try:
                    import os
                    with open(os.path.join(os.path.dirname(__file__), '..', 'site_url.txt'), 'r') as f:
                        site_url = f.read().strip()
                except:
                    pass
                    
                if job.access_token:
                    magic_link = f"{site_url}/files.html?job_id={job.id}&token={job.access_token}"
                    drive_msg = f"\n☁️ **Google Drive:** https://drive.google.com/drive/folders/{job.drive_folder_id}" if job.drive_folder_id else ""
                    await files_channel.send(f"📂 **Project Files Portal:**\nAccess the raw footage and upload your final render here:\n{magic_link}{drive_msg}")
            
            # Send log to owners
            if LOG_CHANNEL_ID:
                log_channel = guild.get_channel(LOG_CHANNEL_ID)
                if log_channel:
                    embed = discord.Embed(
                        title="🆕 New Job Started",
                        description=f"**{job.title}** has been assigned to **{editor.name}** for **{client.name}**.\nChannels created: {chat_channel.mention if chat_channel else '#' + chat_channel_name}",
                        color=discord.Color.blue()
                    )
                    await log_channel.send(embed=embed)

        # Handle deleted jobs
        deleted_jobs = db.query(Job).filter(Job.status == "Deleted").all()
        for job in deleted_jobs:
            print(f"[BOT] Deleting channels for job #{job.id}...")
            # Look for channels
            chat_channel = discord.utils.get(guild.channels, name=f"📋・job-{job.id}")
            if chat_channel:
                await chat_channel.delete()
                
            files_channel = discord.utils.get(guild.channels, name=f"📦・files-{job.id}")
            if files_channel:
                # Store category reference before deleting the last channel
                category = files_channel.category
                await files_channel.delete()
                
                # If category is now empty (or only has other jobs), we can delete it. 
                # For safety, let's only delete the category if it has no channels left.
                if category and len(category.channels) == 0:
                    await category.delete()
                    
            db.delete(job)
            db.commit()

    except Exception as e:
        print("Error checking jobs:", e)
    finally:
        db.close()

@bot.command(name='finish')
async def finish_job(ctx):
    # Determine which job this is based on channel name
    channel_name = ctx.channel.name
    if not channel_name.startswith("📋・job-"):
        await ctx.send("This command can only be used in job channels.")
        return
        
    try:
        job_id = int(channel_name.split("-")[1])
    except:
        return
        
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            await ctx.send("Job not found in the database.")
            return
            
        job.status = "Pending Review"
        db.commit()
        await ctx.send(f"✅ Job #{job.id} marked as **Pending Review**. The agency owners have been notified on the dashboard.")
        
        # Send log to owners
        if LOG_CHANNEL_ID:
            guild = ctx.guild
            if guild:
                log_channel = guild.get_channel(LOG_CHANNEL_ID)
                if log_channel:
                    embed = discord.Embed(
                        title="✅ Job Completed",
                        description=f"Editor **{job.editor.name}** just finished **{job.title}**!\nReview the files in {ctx.channel.mention} and update the Dashboard.",
                        color=discord.Color.green()
                    )
                    await log_channel.send(embed=embed)
    finally:
        db.close()

class JobDetailsModal(discord.ui.Modal, title='Finalize Job Details'):
    def __init__(self, editor_discord_id, client_discord_id, pre_title, pre_service, pre_desc):
        super().__init__()
        self.editor_discord_id = editor_discord_id
        self.client_discord_id = client_discord_id
        
        self.project_name = discord.ui.TextInput(label='Project Title', default=pre_title, required=True, max_length=100)
        self.service_type = discord.ui.TextInput(label='Service Type', default=pre_service, required=True, max_length=50)
        self.description = discord.ui.TextInput(label='Description', style=discord.TextStyle.paragraph, default=pre_desc, required=True, max_length=1000)
        self.price = discord.ui.TextInput(label='Price (Numbers only)', placeholder='150.00', required=True, max_length=10)
        
        self.add_item(self.project_name)
        self.add_item(self.service_type)
        self.add_item(self.description)
        self.add_item(self.price)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        db = SessionLocal()
        try:
            client = db.query(User).filter(User.discord_id == self.client_discord_id).first()
            if not client:
                member = interaction.guild.get_member(int(self.client_discord_id))
                name = member.name if member else f"Client {self.client_discord_id}"
                client = User(discord_id=self.client_discord_id, name=name, role='client')
                db.add(client)
                db.commit()
                db.refresh(client)

            editor = db.query(User).filter(User.discord_id == self.editor_discord_id).first()
            if not editor:
                member = interaction.guild.get_member(int(self.editor_discord_id))
                name = member.name if member else f"Editor {self.editor_discord_id}"
                editor = User(discord_id=self.editor_discord_id, name=name, role='editor')
                db.add(editor)
                db.commit()
                db.refresh(editor)
                
            try:
                price_val = float(self.price.value)
            except:
                price_val = 0.0
                
            # Generate a secure access token
            import secrets
            token = secrets.token_urlsafe(16)
            
            new_job = Job(
                title=self.project_name.value,
                client_id=client.id,
                editor_id=editor.id,
                service=self.service_type.value,
                description=self.description.value,
                status="Editing",
                client_price=price_val,
                access_token=token
            )
            db.add(new_job)
            db.commit()
            db.refresh(new_job)
            
            # Create Google Drive folder if possible
            import sys
            import os
            sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
            try:
                from backend.drive import create_job_folder
                DRIVE_ROOT_FOLDER_ID = os.getenv('DRIVE_ROOT_FOLDER_ID')
                if DRIVE_ROOT_FOLDER_ID:
                    folder_id = create_job_folder(f"Job #{new_job.id} - {new_job.title}", DRIVE_ROOT_FOLDER_ID)
                    new_job.drive_folder_id = folder_id
                    db.commit()
            except Exception as e:
                print("Could not create drive folder:", e)
            
            # Message only for the admin
            await interaction.followup.send(f"✅ Job created successfully! The editor channels will be generated in a few seconds.", ephemeral=True)
            
            # Message for the client
            await interaction.channel.send("🎉 **Quote Approved!** Your project has been officially started. We will keep you updated here in this channel.")
            
            # Send the magic link
            site_url = 'http://127.0.0.1:8000'
            try:
                import os
                with open(os.path.join(os.path.dirname(__file__), '..', 'site_url.txt'), 'r') as f:
                    site_url = f.read().strip()
            except:
                pass
            
            magic_link = f"{site_url}/files.html?job_id={new_job.id}&token={token}"
            drive_msg = f"\n☁️ **Google Drive:** https://drive.google.com/drive/folders/{folder_id}" if folder_id else ""
            await interaction.channel.send(f"📂 **Project Files Portal:**\nPlease access your private portal to upload/download project files:\n{magic_link}{drive_msg}")
        finally:
            db.close()

class EditorSelect(discord.ui.Select):
    def __init__(self, client_discord_id, title, service, desc, editors):
        self.client_discord_id = client_discord_id
        self.p_title = title
        self.p_service = service
        self.p_desc = desc
        
        options = []
        for ed in editors:
            options.append(discord.SelectOption(label=ed.name, description=f"Editor", value=ed.discord_id))
            
        super().__init__(placeholder="Select an editor...", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction):
        editor_id = self.values[0]
        # Open final modal
        await interaction.response.send_modal(JobDetailsModal(editor_id, self.client_discord_id, self.p_title, self.p_service, self.p_desc))

class EditorSelectView(discord.ui.View):
    def __init__(self, client_discord_id, title, service, desc, editors):
        super().__init__()
        self.add_item(EditorSelect(client_discord_id, title, service, desc, editors))

class CreateJobView(discord.ui.View):
    def __init__(self, client_discord_id, title, service, desc):
        super().__init__(timeout=None)
        self.client_discord_id = client_discord_id
        self.p_title = title
        self.p_service = service
        self.p_desc = desc
        
    @discord.ui.button(label="Authorize", style=discord.ButtonStyle.grey, emoji="🔐", custom_id="convert_job_btn")
    async def convert_job(self, interaction: discord.Interaction, button: Button):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("Only agency owners can do this.", ephemeral=True)
            return
            
        db = SessionLocal()
        try:
            editors = db.query(User).filter(User.role == 'editor').all()
            if not editors:
                await interaction.response.send_message("No editors found in the database. Add someone to the editor role first.", ephemeral=True)
                return
                
            view = EditorSelectView(self.client_discord_id, self.p_title, self.p_service, self.p_desc, editors)
            await interaction.response.send_message("Select an editor to assign this job to:", view=view, ephemeral=True)
        finally:
            db.close()

class TicketModal(discord.ui.Modal, title='Request a Quote'):
    project_name = discord.ui.TextInput(
        label='Project Title / Video Name',
        placeholder='e.g., Pixel SMP Episode 12',
        required=True,
        max_length=100
    )
    
    service_type = discord.ui.TextInput(
        label='Service Type',
        placeholder='e.g., Minecraft, VTuber, YouTube Vlog...',
        required=True,
        max_length=50
    )
    
    description = discord.ui.TextInput(
        label='Project Description & Details',
        style=discord.TextStyle.paragraph,
        placeholder='Tell us about raw footage length, deadline, budget, and references...',
        required=True,
        max_length=1000
    )

    async def on_submit(self, interaction: discord.Interaction):
        guild = interaction.guild
        client = interaction.user
        
        category = discord.utils.get(guild.categories, name="TICKETS")
        if not category:
            category = await guild.create_category("TICKETS")
            await category.set_permissions(guild.default_role, read_messages=False)
            
        channel = await guild.create_text_channel(
            f"🎫・ticket-{client.name}",
            category=category,
            topic=f"Project: {self.project_name.value} | Service: {self.service_type.value}"
        )
        await channel.set_permissions(client, read_messages=True, send_messages=True)
        
        embed = discord.Embed(
            title="🎫 New Quote Request",
            description=f"Hello {client.mention}! An owner will be with you shortly. Here are your project details:",
            color=discord.Color.green()
        )
        embed.add_field(name="Project", value=f"`{self.project_name.value}`", inline=False)
        embed.add_field(name="Service Type", value=f"`{self.service_type.value}`", inline=False)
        embed.add_field(name="Description", value=f"```\n{self.description.value}\n```", inline=False)
        
        # Attach the Admin-only "Convert to Job" button view
        view = CreateJobView(str(client.id), self.project_name.value, self.service_type.value, self.description.value)
        await channel.send(embed=embed, view=view)
        
        yellow_embed = discord.Embed(
            description="A Voidcut representative will be here shortly to discuss your project and provide a quote.",
            color=discord.Color.yellow()
        )
        msg_content = f"Hey {client.mention}, welcome to your private ticket!"
        await channel.send(content=msg_content, embed=yellow_embed)
        
        await interaction.response.send_message(f"Ticket created: {channel.mention}", ephemeral=True)

class TicketView(View):
    def __init__(self):
        super().__init__(timeout=None)
        
    @discord.ui.button(label="Open Quote Ticket", style=discord.ButtonStyle.green, emoji="📩", custom_id="create_ticket_btn")
    async def create_ticket(self, interaction: discord.Interaction, button: Button):
        guild = interaction.guild
        client = interaction.user
        
        # Check if they already have a ticket
        existing = discord.utils.get(guild.channels, name=f"🎫・ticket-{client.name.lower()}")
        if existing:
            await interaction.response.send_message(f"You already have an open ticket in {existing.mention}!", ephemeral=True)
            return
            
        await interaction.response.send_modal(TicketModal())

@bot.command(name='ticketpanel')
@commands.has_permissions(administrator=True)
async def ticket_panel(ctx):
    embed = discord.Embed(
        title="🎬 Request a Quote / New Job",
        description="Click the button below to open a private ticket with our team and discuss your video!",
        color=discord.Color.blue()
    )
    await ctx.send(embed=embed, view=TicketView())

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user}')
    bot.add_view(TicketView())
    sync_users.start()
    check_jobs.start()

if __name__ == '__main__':
    if TOKEN and TOKEN != 'seu_token_aqui':
        bot.run(TOKEN)
    else:
        print("Bot token not configured. Set DISCORD_BOT_TOKEN in .env")
