import { useEffect, useState } from "react";

interface LoadingDotsProps {
    className?: string;
}

export function LoadingDots({ className = "" }: LoadingDotsProps) {
    const [dots, setDots] = useState(".");

    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => {
                if (prev === ".") return "..";
                if (prev === "..") return "...";
                return ".";
            });
        }, 500); // Change every 500ms

        return () => clearInterval(interval);
    }, []);

    return <span className={className}>{dots}</span>;
}

