import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import ArticleIcon from '@mui/icons-material/Article';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ClearIcon from '@mui/icons-material/Clear';
import TelegramIcon from '@mui/icons-material/Telegram';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';

// Single source of truth for all commands
// selfClosing: true means <command/>, false means <command>...</command>
export const COMMANDS = {
    setMemory: { icon: SaveIcon },
    deleteItem: { icon: DeleteIcon },
    cleanupMemory: { icon: ClearIcon, selfClosing: true },
    scheduleTask: { icon: ScheduleIcon },
    getScheduledTasks: { icon: ListAltIcon, selfClosing: true },
    deleteScheduledTask: { icon: ClearIcon },
    sendToTelegramChannel: { icon: TelegramIcon },
    sendPhotoToTelegramChannel: { icon: PhotoCameraIcon },
    googleSearch: { icon: SearchIcon },
    webpageToText: { icon: ArticleIcon },
    createAIImage: { icon: ImageIcon }
};

// Generate regex patterns from commands
export const COMMAND_PATTERNS = Object.entries(COMMANDS).map(([name, config]) => {
    if (config.selfClosing) {
        return new RegExp(`<${name}\\s*\\/>`);
    }
    return new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
});

// Get icon for a command
export const getCommandIcon = (name) => COMMANDS[name]?.icon;

// Check if command name is valid
export const isValidCommand = (name) => name in COMMANDS;
