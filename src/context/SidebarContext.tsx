import { createContext, useContext, useEffect, useState } from 'react';

type SidebarContextType = {
    isExpanded: boolean;
    isMobileOpen: boolean;
    isHovered: boolean;
    activeItem: string | null;
    openSubmenu: string | null;
    toggleSidebar: () => void;
    toggleMobileSidebar: () => void;
    setIsHovered: (isHovered: boolean) => void;
    setActiveItem: (item: string | null) => void;
    toggleSubmenu: (item: string) => void;
    setIsMobileOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
};

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [activeItem, setActiveItem] = useState<string | null>(null);
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

    useEffect(() => {
        const handleResize = () => {
            // 1024 px, pas 1280. Sous 1280, un portable en 1152 px — une
            // résolution courante — se retrouvait avec le tiroir mobile alors
            // qu'il y a largement la place pour une barre latérale fixe. Le
            // tiroir est fait pour le téléphone, pas pour l'ordinateur.
            //
            // Ce seuil doit rester aligné sur le `lg:` utilisé dans
            // AppSidebar, AppHeader et Backdrop. Le CSS et ce TypeScript
            // décident la même chose : s'ils divergent, l'interface affiche une
            // barre fixe pendant que React croit être en mode mobile, et le
            // bouton d'ouverture apparaît sans que rien ne se passe.
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (!mobile) {
                setIsMobileOpen(false);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const toggleSidebar = () => {
        setIsExpanded((prev) => !prev);
    };

    const toggleMobileSidebar = () => {
        setIsMobileOpen((prev) => !prev);
    };

    const toggleSubmenu = (item: string) => {
        setOpenSubmenu((prev) => (prev === item ? null : item));
    };

    return (
        <SidebarContext.Provider
            value={{
                isExpanded: isMobile ? false : isExpanded,
                isMobileOpen,
                isHovered,
                activeItem,
                openSubmenu,
                toggleSidebar,
                toggleMobileSidebar,
                setIsHovered,
                setActiveItem,
                toggleSubmenu,
                setIsMobileOpen,
            }}
        >
            {children}
        </SidebarContext.Provider>
    );
};
