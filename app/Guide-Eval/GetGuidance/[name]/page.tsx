"use client"

import Image from "next/image";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { cn } from '@/lib/utils';
import Markdown from 'react-markdown'
import React from 'react'
import { Button } from "@/components/ui/button";
import styles from '@/styles/styles.module.css'
import "@/styles/LoginFormComponent.css";
import toast, { Toaster } from "react-hot-toast";
import { BeatLoader } from "react-spinners";

export default function Page({ params }: { params: { name: string } }) {

    const name = params.name;
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState("");
    const [output, setOutput] = useState("The response will appear here...");

    const onSubmit = async () => {
        // Clear the output
        setOutput("The response will appear here...");

        toast.success("Creating a response for what causes and cure for " + name);

        // Set the loading state to true
        setLoading(true);

        try {
            // Create FormData to match what route.ts expects
            const formData = new FormData();
            formData.append("userPrompt", `can you tell me what is ${name} and what is the possible cure for it?`);
            formData.append("age", "not specified");

            // Create a post request to the /api/chat endpoint with FormData
            const response = await fetch("/api/chat", {
                method: "POST",
                body: formData, // Send as FormData instead of JSON
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            // Get the response from the server
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            if (!data.text || data.text === "") {
                throw new Error("No response from the server!");
            }

            // Set the response in the state
            setResponse(data.text);
        } catch (error) {
            console.error("Error fetching response:", error);
            toast.error(error.message || "Failed to get response");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Update the response character by character in the output
        if (!response || response.length === 0) return;

        setOutput("");
        
        // More efficient animation with fewer timeouts
        const charsPerBatch = 5;
        const batchDelay = 10;
        const timeoutIds: NodeJS.Timeout[] = [];

        for (let i = 0; i < response.length; i += charsPerBatch) {
            const timeoutId = setTimeout(() => {
                setOutput(prev => prev + response.slice(i, Math.min(i + charsPerBatch, response.length)));
            }, Math.floor(i / charsPerBatch) * batchDelay);
            timeoutIds.push(timeoutId);
        }

        // Clean up timeouts on component unmount
        return () => timeoutIds.forEach(id => clearTimeout(id));
    }, [response]);

    return (
        <div>
            <Toaster position="top-center" />
            <div className='flex flex-col items-center h-screen gap-6'>
                <h1 className='text-4xl font-extrabold mt-1'>{name}</h1>
                <h1 className='text-1xl font-bold mt-1'>Creating a response for what causes and cure for <span className="text-red-500">{name}</span></h1>
                <Card className={cn("p-5 whitespace-normal min-w-[320px] sm:w-[500px] md:min-w-[600px] max-h-[400px] overflow-y-auto")}>
                    <div className={styles.textwrapper}>
                        <Markdown className={cn("w-full")}>{output}</Markdown>
                    </div>
                </Card>
                {loading ? (
                    <Button disabled>
                        <BeatLoader color="white" size={8} />
                    </Button>
                ): (
                    <Button onClick={onSubmit}>Get Details</Button>
                )}
            </div>
        </div>
    )
}
